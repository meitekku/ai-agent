# rag-ui — RAG チャット前端

**后端**: LightRAG (:8007, 主要)
**LLM**: Gemini API（默认） / MLX qwen3.5-35B-A3B (:8008, フォールバック) — `GEMINI_API_KEY` の有無で自動切替
**外部端口**: 4002（容器内 3000）

## 技术栈

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- shadcn/ui（已初始化）
- AI Elements（`ai-elements`）— Conversation, Message, PromptInput コンポーネント
- Vercel AI SDK (`ai` v6) — streamText + createUIMessageStream + useChat
- `@ai-sdk/react` — useChat フック
- `@ai-sdk/openai` — MLX OpenAI 互換プロバイダー（フォールバック用）
- `@ai-sdk/google` — Gemini プロバイダー
- `streamdown` — Markdown レンダリング（CJK, code, math, mermaid プラグイン）
- Bun

## 架构

```
Browser useChat → /api/chat Route Handler → isImageModel?
                                            → YES: generateText + responseModalities → 画像保存 → UIMessageStream
                                            → NO:  Gemini/MLX streamText + stopWhen(30) + tool calling
                                              → searchKnowledgeBase（LightRAG search-only）
                                              → webSearch / readPage（Tavily）or google_search（Gemini grounding）
                                              → artifact（create/update/rewrite → サイドパネル表示）
                                              → generateImage（Gemini 画像生成ツール）
                                              → analyzeImage（Gemini Vision 画像分析）
                                              → readFile / editFile / listFiles / grepFiles（ファイル操作）
                                              → httpRequest / queryDatabase（HTTP・SQL）
                                              → createScheduledTask / listScheduledTasks / updateScheduledTask / deleteScheduledTask（定時タスク管理）
```

- マルチモーダル対応：画像・テキスト・PDF を添付可能（サーバーアップロード → URL 参照 → DB 軽量化）
- ファイルはドラッグ&ドロップ / クリップボード貼り付け / ボタン選択で添付
- ファイルアップロード: 添付時に即座に `/api/files/upload` → ディスク保存 → DB には URL 参照のみ保存
- チャット送信時: `resolveServerFiles()` がモデルメッセージ内のサーバー URL / data URL → `Uint8Array` バイナリ変換 → Gemini API へ送信
- 画像表示: `<img src="/api/files/{id}">` でサーバーから直接配信（immutable cache）、クリックで shadcn Dialog ライトボックス拡大
- 画像生成: 2つのパス — (A) 画像モデル選択時は `generateText` + `responseModalities` でネイティブ画像出力、(B) テキストモデルから `generateImage` ツールで AI SDK `generateImage()` 呼出
- 生成画像は `saveFile()` でディスク保存 + `insertChatFile()` で DB 登録 → `/api/files/{id}` で配信
- 画像モデル使用中はスケルトンプレースホルダー表示 + `beforeunload` + SPA ナビガードで離脱防止
- 孤立ファイル自動削除: 起動時 + 6時間ごとに未参照ファイル（60分以上）をクリーンアップ。`task_execution_files` で参照されたファイルは除外
- 会話削除時にファイルもカスケード削除（DB + ディスク）
- Chat は tool-calling 方式：LLM が質問内容に応じて searchKnowledgeBase ツールの使用を判断
- `kb_config` テーブルで KB の title + description を管理 → ツール description に動的注入
- 一般的な挨拶・雑談はツールを使わず直接回答（不要な RAG 検索をスキップ）
- ウェブ検索自動フォールバック: `TAVILY_API_KEY` 設定時→Tavily（webSearch+readPage）、未設定時→Gemini Google Search grounding（`google_search`）、どちらもなし→KB 検索のみ
- 文档上传（異步）: rag-ui → LightRAG /ingest → OCR 完了即応答 → 後台 LLM 実体抽出
- 前端 5秒ポーリングで入庫状態更新（processing → processed / failed）
- 文档管理 API 直接代理到 LightRAG 服务（/documents 含 status 字段）
- Generative UI（Widget）: モデルが `show-widget` コードフェンスを出力 → MessageResponse が streamdown 外でパース → WidgetRenderer が sandbox iframe でレンダリング
  - 参考実装: CodePilot（`/mnt/c/Users/wzhao/Downloads/CodePilot-main`）。rag-deploy のみの機能、ソース rag-ui には同期しない
  - アーキテクチャ: MessageResponse → parseAllShowWidgets() でテキスト/widget セグメント分割 → テキストは Streamdown、widget は WidgetRenderer
  - isStreaming 判定: コードフェンスの閉じ ``` 検出（streamdown の isIncomplete に依存しない）
  - セキュリティ: `sandbox="allow-scripts"` + CSP（script-src CDN 白名単 + unsafe-inline、connect-src 'none'）
  - DOM 更新: morphdom v2.7.4（iframe 内インライン）で DOM diff。innerHTML 全置換ではなく変更ノードのみパッチ → テキスト逐次表示
  - 逐語アニメーション: morphdom 更新後、新規テキストを `[data-wa]` span で包み CSS stagger delay で順次表示（streamdown animated 方式）
  - Streaming: sanitizeForStreaming（script 除去 + 未閉じタグ除去）→ requestAnimationFrame → postMessage widget:update
  - Finalize: sanitizeForIframe（embedding タグのみ除去）→ postMessage widget:finalize → script clone + appendChild で実行
  - テーマ同期: MutationObserver で html class 変化検出 → postMessage widget:theme
  - デザイン: フラット（外側カード/shadow/border なし）、背景透明、motion アニメーションなし

## LLM 后端自動切替

`GEMINI_API_KEY` または `USE_VERTEX_AI` の設定で自動的に LLM バックエンドを選択。UI でのバックエンド切替は廃止。

| 条件                        | バックエンド | 説明                                       |
| --------------------------- | ------------ | ------------------------------------------ |
| `USE_VERTEX_AI=true`        | **Gemini (Vertex AI)** | GCP billing 経由（Free Trial credit 使用可） |
| `GEMINI_API_KEY` が設定済み | **Gemini (AI Studio)** | API Key 認証（直接課金） |
| どちらも未設定              | **MLX**      | Qwen3.5-35B-A3B-4bit（ローカル port 8008） |

- 判定ロジック: `lib/ollama-provider.ts` の `getChatModel()` / `useGemini`
- Vertex AI 使用時は `providerOptionsKey` が `"vertex"` になり、`providerOptions` のキーが動的に切替
- Vertex AI 使用時は Google Search grounding（`geminiGoogleSearch`）非対応、ウェブ検索は Tavily 必須
- MLX 使用時はシステムプロンプト末尾に `/no_think` を付加
- `next.config.ts` の `env.NEXT_PUBLIC_LLM_BACKEND` でクライアント側にバックエンド名を公開
- Ollama は **Embedding 専用**（qwen3-embedding:8b）、LLM 生成には使用しない

### MLX 设定（フォールバック用）

- PM2 服务 `qwen3.5-mlx`（port 8008、OpenAI 互換 API）
- **必须加 `--chat-template-args '{"enable_thinking":false}'`** — 否则 Qwen3.5 默认启用 thinking，回答跑到 `reasoning` 字段，`content` 为空
- rag-ui 通过 `@ai-sdk/openai` 的 `createOpenAI({ baseURL: MLX_URL/v1 })` 接入
- LightRAG 实体抽取通过 `lightrag.llm.openai.openai_complete` + `base_url` 接入（`LLM_PROVIDER=mlx`）

## 依赖服务一览

| 服务               | 端口  | 用途                            | 管理方式               |
| ------------------ | ----- | ------------------------------- | ---------------------- |
| **qwen3.5-mlx**    | 8008  | LLM 生成（MLX、フォールバック） | PM2 (qwen3.5-mlx)      |
| **Ollama**         | 11434 | Embedding 専用                  | macOS Ollama.app       |
| **LightRAG**       | 8007  | 知识图谱検索 + 文档入库         | PM2 (lightrag-service) |
| **glm-ocr**        | 8000  | PDF OCR（GLM-OCR 模型）         | PM2 (glm-ocr)          |
| **PostgreSQL**     | 5432  | LightRAG 向量存储               | 系统服务               |
| **Valkey (Redis)** | 6379  | 查询語義缓存                    | 系统服务               |

### 开发命令

```bash
bun dev              # 启动 dev server
```

### PM2 管理

所有后端服务通过 `~/Desktop/ai/ecosystem.config.js` 管理:

```bash
pm2 list                          # 查看状态
pm2 logs lightrag-service         # 查看日志
pm2 save                          # 持久化进程列表
# ⚠️ 修改 ecosystem.config.js 的 env 后，必须 delete + start，restart --update-env 无效
pm2 delete lightrag-service && pm2 start ~/Desktop/ai/ecosystem.config.js --only lightrag-service
```

## 环境变量

| 变量                     | 默认值                               | 说明                                                        |
| ------------------------ | ------------------------------------ | ----------------------------------------------------------- |
| `LIGHTRAG_URL`           | http://localhost:8007                | LightRAG 服务地址                                           |
| `QUERY_SERVICE_URL`      | http://localhost:8006                | PageIndex 查询服务地址                                      |
| `MLX_URL`                | http://localhost:8008                | MLX サーバー地址（フォールバック用）                        |
| `MLX_MODEL`              | mlx-community/Qwen3.5-35B-A3B-4bit   | MLX モデル名                                                |
| `OLLAMA_URL`             | http://localhost:11434               | Ollama 地址（Embedding 専用）                               |
| `REDIS_URL`              | redis://localhost:6379               | Valkey 缓存地址                                             |
| `GEMINI_API_KEY`         | (空)                                 | Gemini API Key（設定時→Gemini、未設定→MLX フォールバック）  |
| `GEMINI_MODEL`           | gemini-3-flash-preview               | Gemini LLM 模型（デフォルト、チャット別にユーザーが変更可） |
| `GEMINI_EMBEDDING_MODEL` | text-embedding-004                   | Gemini Embedding 模型                                       |
| `EMBEDDING_PROVIDER`     | local                                | Embedding 提供者（`local` / `gemini`）                      |
| `DATABASE_URL`           | postgresql://localhost:5432/lightrag | PostgreSQL 接続 URL（チャット履歴・Artifact 保存用）        |
| `SKILLS_DIR`             | data/skills                          | スキルファイル保存ディレクトリ（Docker: /app/data/skills）  |

## 项目结构

```
rag-ui/
├── app/
│   ├── layout.tsx                     # Root layout（providers + AppShell）
│   ├── page.tsx                       # / → /new リダイレクト
│   ├── new/page.tsx                   # 新規チャット → ChatPage ラッパー
│   ├── chat/[id]/page.tsx             # 既存チャット（DB ロード → ChatPage）
│   ├── documents/
│   │   ├── page.tsx                   # ナレッジベース一覧ページ
│   │   └── [slug]/page.tsx            # ナレッジベース詳細（ドキュメント管理）
│   ├── skills/page.tsx                # スキル管理ページ
│   └── api/
│       ├── chat/route.ts              # streamText + createUIMessageStream + tool calling + artifact tool + CRM tools + 画像
│       ├── kbs/
│       │   ├── route.ts               # GET/POST ナレッジベース一覧/作成
│       │   └── [slug]/
│       │       ├── route.ts           # GET/PUT/DELETE ナレッジベース詳細
│       │       └── generate/route.ts  # POST LLM で title+description 自動生成
│       ├── ui-config/
│       │   └── route.ts               # GET/PUT UI設定（サイドバー状態等）
│       ├── skills/
│       │   ├── route.ts               # GET/POST スキル一覧/新規作成
│       │   ├── [id]/route.ts          # PUT/DELETE スキル更新/削除
│       │   ├── upload/route.ts        # POST ZIP スキルアップロード
│       │   └── registry/
│       │       ├── route.ts           # GET skills.sh 検索プロキシ
│       │       ├── install/route.ts   # POST skills.sh スキルインストール
│       │       └── update/route.ts    # POST registry スキル一括更新
│       ├── history/chats/
│       │   ├── route.ts               # GET/POST チャット履歴一覧/新規作成
│       │   └── [id]/
│       │       ├── route.ts           # GET/PATCH/DELETE 会話詳細/更新/削除
│       │       └── messages/route.ts  # POST メッセージ保存
│       ├── documents/
│       │   ├── route.ts               # GET 文档列表
│       │   ├── upload/route.ts        # POST PDF 上传
│       │   └── [id]/route.ts          # DELETE 文档删除
│       ├── artifacts/
│       │   ├── route.ts               # GET ?conversationId= アーティファクト取得（内容+バージョン一覧）
│       │   └── [id]/
│       │       ├── route.ts           # GET アーティファクト詳細（メタ+バージョン+内容）
│       │       └── versions/
│       │           └── [version]/route.ts # GET 特定バージョン内容
│       ├── crm/
│       │   ├── proposal-plan/route.ts       # POST crm-service plan JSON 生成プロキシ
│       │   ├── proposal-render/route.ts     # POST crm-service PPTX レンダリングプロキシ
│       │   ├── proposal-revise-slide/route.ts # POST crm-service 1 スライド修正プロキシ
│       │   └── templates/route.ts           # GET/POST crm-service テンプレート一覧・アップロードプロキシ
├── components/
│   ├── ui/                    # shadcn コンポーネント（コマンド生成、手動変更不可）
│   ├── ai-elements/           # AI Elements コンポーネント（コマンド生成）
│   ├── chat-input.tsx         # チャット入力（ファイル添付、アップロード進捗、D&D、リトライ対応）
│   ├── chat-message.tsx       # チャットメッセージ（マルチモーダル、画像大表示、ArtifactCard、reasoning インライン）
│   ├── artifact-panel.tsx     # Artifact サイドパネル（HTML/code/markdown/text 渲染、バージョン切替、コピー、ダウンロード）
│   ├── widget-renderer.tsx    # Generative UI: sandbox iframe + postMessage（CodePilot 方式）
│   ├── widget-shimmer.tsx     # Widget ローディングシマーオーバーレイ
│   ├── image-lightbox.tsx     # shadcn Dialog ベース画像拡大表示 + ダウンロードボタン
│   ├── app-shell.tsx           # AppShell（sidebar + header ラッパー、layout から使用）
│   ├── app-sidebar.tsx        # ナビゲーションサイドバー（overlay/pinned、チャット履歴）
│   ├── chat-page.tsx          # チャット共有コンポーネント（履歴+ブランチ+Artifact復元+streaming検出）
│   ├── documents-page.tsx     # ナレッジベース一覧ページ
│   ├── kb-detail-page.tsx     # ナレッジベース詳細（ドキュメント管理+設定編集）
│   └── skills-page.tsx        # スキル CRUD + ZIP アップロード + skills.sh レジストリ（自動更新）
├── lib/
│   ├── utils.ts           # shadcn 自動生成
│   ├── store.ts           # Zustand store（sidebar 状態管理）
│   ├── chat-db.ts         # PostgreSQL チャット会話CRUD（pg）
│   ├── chat-tree.ts       # Zustand ツリー管理（ブランチ操作、パス計算）
│   ├── ui-config-db.ts    # PostgreSQL UI設定CRUD（single-row、JSONB preferences）
│   ├── constants.ts       # 環境変数定義
│   ├── rag-client.ts      # LightRAG/QueryService HTTP クライアント
│   ├── ollama-provider.ts # AI SDK プロバイダー設定（Gemini/MLX 自動切替 + 画像モデル）
│   ├── embedding-client.ts # Embedding クライアント（Ollama/Gemini 切替）
│   ├── semantic-cache.ts  # Valkey/Redis 查询缓存（TTL 1h）
│   ├── artifact-db.ts     # PostgreSQL Artifact CRUD + バージョン管理（artifacts + artifact_versions テーブル）
│   ├── artifact-tool.ts   # AI SDK artifact ツール（create/update/rewrite、writer 経由で流式推送）+ unesc() エスケープ修正
│   ├── artifact-store.ts  # Zustand store（Artifact 状態管理、streaming 対応）
│   ├── skills-db.ts       # PostgreSQL スキルCRUD + createSkillWithFiles（DB + ディスク一括作成）
│   ├── skill-storage.ts   # スキルファイルディスク I/O（agentskills.io 準拠、data/skills/{id}/）
│   ├── skill-zip-parser.ts # ZIP スキル解析（SKILL.md frontmatter + body + refs 構造化返却）
│   ├── skill-registry.ts  # skills.sh レジストリ共有ヘルパー（GitHub SKILL.md 取得 + frontmatter 解析）
│   ├── built-in-skills.ts # 起動時内置スキル自動同期（source_type = "built-in"）
│   ├── file-storage.ts    # ファイルディスク I/O（保存/読込/パス解決）
│   ├── chat-files-db.ts   # chat_files テーブル CRUD
│   ├── file-cleanup.ts    # 孤立ファイル自動削除
│   ├── widget-parser.ts   # show-widget コードフェンス解析（セグメント分割 + JSON 抽出）
│   ├── widget-sanitizer.ts # Widget HTML 消毒 + iframe srcdoc ビルダー（CSP + postMessage）
│   ├── widget-css-bridge.ts # CSS 変数ブリッジ（rag-ui oklch → widget 標準変数名）
│   └── widget-guidelines.ts # Widget 生成システムプロンプト（~150 tokens）
├── hooks/
│   └── use-file-upload.ts # クライアント自動アップロード（XHR 進捗、リトライ対応）
├── instrumentation.ts     # 起動時キャッシュフラッシュ + 孤立ファイルクリーンアップ
├── next.config.ts         # output: "standalone" + env.NEXT_PUBLIC_LLM_BACKEND
├── CLAUDE.md
└── README.md
```

**注意**: 本项目未使用 `src/` 目录，app/components/lib 直接在根目录下。

## ページルーティング

| パス                | 説明                                        |
| ------------------- | ------------------------------------------- |
| `/`                 | `/new` にリダイレクト                       |
| `/new`              | 新規チャット                                |
| `/chat/[id]`        | 既存チャット（DB からロード、ブランチ対応） |
| `/documents`        | ナレッジベース一覧                          |
| `/documents/[slug]` | ナレッジベース詳細（ドキュメント管理）      |
| `/skills`           | スキル管理（CRUD + 有効/無効切替）          |

- `AppShell`（sidebar + header）は `layout.tsx` で全ページ共通
- sidebar は `usePathname()` でアクティブなナビを判定 + チャット履歴一覧表示
- header は `usePathname()` でタイトル/アイコンを切替
- `/new` で初回送信後、`replaceState` で `/chat/[id]` に URL 更新（リマウントなし）

## API Routes

| メソッド             | パス                             | 説明                                                                            |
| -------------------- | -------------------------------- | ------------------------------------------------------------------------------- |
| POST                 | /api/chat                        | AI チャット（streamText + createUIMessageStream + tool calling + artifact + Valkey cache） |
| POST                 | /api/files/upload                | ファイルアップロード（multipart/form-data → ディスク保存 + DB 記録）            |
| GET                  | /api/files/[id]                  | ファイル配信（immutable cache、Content-Type 付き）                              |
| GET/POST             | /api/kbs                         | ナレッジベース一覧 / 新規作成                                                   |
| GET/PUT/DELETE       | /api/kbs/[slug]                  | ナレッジベース詳細 / 更新 / 削除                                                |
| POST                 | /api/kbs/[slug]/generate         | LLM で title+description 自動生成                                               |
| GET/PUT              | /api/ui-config                   | UI設定（サイドバー状態等、JSONB preferences）                                   |
| GET                  | /api/documents                   | 文档列表                                                                        |
| POST                 | /api/documents/upload            | PDF 上传（→ LightRAG /ingest）                                                  |
| DELETE               | /api/documents/[id]              | 文档削除/キャンセル（→ LightRAG 知識グラフ+ベクトル完全削除）                   |
| POST                 | /api/documents/[id]/retry        | 失敗ドキュメントのリトライ（KB 保存ファイルから再入庫）                          |
| POST                 | /api/documents/[id]/resume       | 失敗ドキュメントの続行（OCR スキップ、LightRAG pipeline 再実行）                |
| GET/POST             | /api/skills                      | スキル一覧 / 新規作成                                                           |
| PUT/DELETE           | /api/skills/[id]                 | スキル更新 / 削除                                                               |
| POST                 | /api/skills/upload               | ZIP スキルアップロード（SKILL.md + references）                                 |
| GET                  | /api/skills/registry             | skills.sh 検索プロキシ                                                          |
| POST                 | /api/skills/registry/install     | skills.sh スキルインストール（GitHub SKILL.md 取得）                            |
| POST                 | /api/skills/registry/update      | registry スキル一括更新（ページ開放時自動実行）                                 |
| GET/POST             | /api/history/chats               | チャット履歴一覧 / 新規会話作成                                                 |
| GET/PATCH/DELETE     | /api/history/chats/[id]          | 会話詳細 / 更新 / 削除                                                          |
| POST                 | /api/history/chats/[id]/messages | メッセージ保存 + active_leaf_id 更新                                            |
| GET                  | /api/artifacts                   | 会話の Artifact 取得（?conversationId= → メタ+内容+バージョン一覧）            |
| GET                  | /api/artifacts/[id]              | Artifact 詳細（メタ+バージョン+内容）                                           |
| GET                  | /api/artifacts/[id]/versions/[v] | Artifact 特定バージョン内容                                                     |
| GET/POST             | /api/crm/templates               | crm-service テンプレート一覧 / アップロードプロキシ                             |
| GET/POST             | /api/scheduler                   | 定時タスク一覧 / 新規作成                                                       |
| GET/PATCH/DELETE     | /api/scheduler/[id]              | 定時タスク詳細 / 更新 / 削除                                                    |
| POST                 | /api/scheduler/[id]/run          | 定時タスク手動トリガー                                                          |
| GET                  | /api/scheduler/[id]/executions   | 定時タスク実行履歴                                                              |
| GET                  | /api/notifications               | 未読通知一覧                                                                    |
| PATCH                | /api/notifications               | 通知既読マーク                                                                  |

## 开发命令

```bash
bun dev              # 開発サーバー起動
bun run build        # ビルド
bun run lint         # ESLint
bun run format       # Prettier フォーマット
bun run format:check # Prettier チェック
```

## 已安装 shadcn 组件

button, badge, card, input, textarea, dropdown-menu, label, separator, select, alert-dialog, input-group, field, combobox, tooltip, hover-card, spinner, dialog, button-group, command, switch, scroll-area, tabs, sonner

## 性能优化记录

优化前 ~140s → 优化后 ~15-18s（缓存命中 ~14ms）

| 优化项                 | 改动                                                            | 效果                          |
| ---------------------- | --------------------------------------------------------------- | ----------------------------- |
| LightRAG `ll_keywords` | search-only 传 `ll_keywords=[question]` 跳过 LLM 关键词提取     | 搜索 17s → 0.1s（最大优化点） |
| tool calling 復活      | LLM が searchKnowledgeBase の使用を判断、一般質問は検索スキップ | 一般質問 ~8-10s（検索なし）   |
| `/no_think`            | 系统提示末尾加 `/no_think`（MLX のみ）                          | 跳过 qwen3 思考 token         |
| Valkey 缓存            | 相同查询直接返回缓存                                            | 重复查询 ~14ms                |
| 再生成时跳过缓存       | `regenerate({ body: { skipCache: true } })`                     | 再生成は常に LLM 再問い合わせ |

### 注意事项

- LightRAG search-only 的 `only_need_context=True` 仍会调 LLM 做关键词提取，必须传 `ll_keywords` 跳过
- Valkey 缓存的 key 标准化：小写 + trim + 合并空格（不能用 `\w` 正则，会丢日文字符）
- LightRAG 查询模式用 `hybrid`（行业推荐，开销极小），不要改成 `local`

## チャット履歴・ブランチ機能

### アーキテクチャ

- **永続化**: PostgreSQL に `chat_conversations` + `chat_messages` テーブル
- **ツリー構造**: `chat_messages.parent_id` で親子関係、同じ parent_id を持つメッセージ = 兄弟（ブランチ）
- **ブランチ管理**: `lib/chat-tree.ts`（Zustand ストア）でメッセージツリーを管理、`active_leaf_id` からパス逆算
- **共有コンポーネント**: `components/chat-page.tsx` が `/new` と `/chat/[id]` 両方で使用

### 操作フロー

| 操作                   | 動作                                                                          |
| ---------------------- | ----------------------------------------------------------------------------- |
| 新規チャット（`/new`） | 初回送信時に会話作成 + `replaceState` で `/chat/[id]` に URL 更新             |
| メッセージ送信         | `onFinish` で user + assistant メッセージを DB 保存                           |
| メッセージ編集         | 編集前メッセージの `parent_id` を引き継ぎ、新 user メッセージを兄弟として作成 |
| 再生成                 | 新 assistant メッセージを同じ parent の兄弟として作成                         |
| ブランチ切替           | `active_leaf_id` 更新 → ツリーからアクティブパス再計算 → `setMessages()`      |
| 履歴一覧               | サイドバーに日付グループ表示（React Query、30秒リフレッシュ）                 |

### UI コンポーネント

- **BranchSelector**: `< 1/2 >` 形式のインラインセレクター（user/assistant 両方に表示）
- **編集モード**: ユーザーメッセージのペンアイコン → インライン textarea → 送信/キャンセル

## 注意事項

- MLX 通过 `@ai-sdk/openai` 的 OpenAI 兼容模式接入（`createOpenAI({ baseURL: MLX_URL/v1 })`），使用 `mlx.chat(model)`
- **MLX は `.chat()` を使う** — デフォルト呼び出しは OpenAI Responses API を使用し、MLX は非対応
- Gemini 通过 `@ai-sdk/google` 的 `createGoogleGenerativeAI` 接入，直接使用 `gemini(model)` 即可（不需要 `.chat()`）
- MLX server 必须加 `--chat-template-args '{"enable_thinking":false}'`，否则 content 为空
- `next.config.ts` 不使用 rewrites，所有 API 通过 Route Handler 处理
- PDF 上传流程: rag-ui → LightRAG /ingest → glm-ocr (:8000) OCR → Markdown → 知识图谱
- 语义缓存的 embedding 可通过 `EMBEDDING_PROVIDER=gemini` 切换为 Gemini text-embedding-004
- 文档削除会调用 LightRAG `adelete_by_doc_id()` 彻底清理知識グラフ（chunks、entities、relations、graph、vectors）
- Embedding 模型: Ollama qwen3-embedding:8b（4096次元、MTEB 多语言排行榜第一、日语対応）

## レイアウト

- Header: flex で上部固定
- ChatInput: absolute bottom-0 で下部固定（グラデーションフェード付き）
- Conversation: flex-1 スクロール（ConversationContent に pb-48 で ChatInput との重なり対策）

## Artifact システム

Agent loop 内で全ての成果物を生成・更新する統一アーティファクトシステム。サイドパネルに表示。

### アーキテクチャ

```
streamText + createUIMessageStream
  → LLM が artifact tool 呼出（create/update/rewrite）
  → tool execute: DB 保存 + writer.write() で data-artifact イベント推送
  → クライアント: onData → useArtifactStore → ArtifactPanel 表示
  → 流式渲染: tool input の input-streaming 状態を監視 → 部分 content を面板にリアルタイム表示
```

### Artifact ツール（3コマンド）

| コマンド | パラメータ | 動作 |
|----------|-----------|------|
| `create` | title, kind(html/code/text/markdown), content, language? | 新規作成 → DB + writer 推送 |
| `update` | id, oldStr, newStr | テキスト置換（小さな変更） → 新バージョン |
| `rewrite` | id, content | 全体書き換え（大きな変更） → 新バージョン |

### Artifact 種別

| kind | 渲染方式 | ダウンロード |
|------|---------|-------------|
| `html` | 完全な HTML ドキュメント（DOCTYPE/html/head 付き）は直接 iframe `srcdoc` 渲染、それ以外は WidgetRenderer（sandbox iframe + morphdom） | .html |
| `code` | Streamdown 構文ハイライト（language パラメータ対応） | .py/.ts/.js 等 |
| `markdown` | Streamdown（見出し・表・リスト・コードブロック） | .md |
| `text` | Streamdown（Markdown として渲染） | .txt |

- **HTML 白画面修正**: `isFullHtmlDocument()` 検出関数で完全な HTML ドキュメントを判定。WidgetRenderer の morphdom/postMessage 処理を経由せず直接 `srcdoc` で iframe にレンダリング（WidgetRenderer 経由だと白画面になるバグの修正）
- **PDF/PPTX エクスポート**: HTML スライド artifact に PDF/PPTX エクスポートボタン追加（html2canvas → jsPDF / PptxGenJS）

### データフロー

1. LLM → `artifact` tool call（`input-streaming` 状態で content が逐次到達）
2. chat-page.tsx の useEffect が `input-streaming` を検出 → `setStreaming()` で面板に部分 content 表示
3. tool 完了 → `writer.write({ type: "data-artifact", data: {...} })` 推送
4. `onData` コールバック → `openArtifact()` / `updateArtifact()` で面板更新
5. DB: `artifacts` + `artifact_versions` テーブルに永続化
6. 会話再開時: `/api/artifacts?conversationId=` から復元

### 上下文注入

毎ターンの system prompt に現在の artifact 内容を注入（Gemini Canvas 方式）:
- `getArtifactByConversation()` で会話の最新 artifact 取得
- content を 15000 字で切り詰め（超過時は rewrite 使用を推奨）
- LLM は既存 artifact の update/rewrite を判断可能

### PostgreSQL テーブル

| テーブル               | 用途                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `chat_conversations`   | チャット会話（id, title, active_leaf_id, kb_slug, chat_model, thinking, timestamps）                       |
| `chat_messages`        | チャットメッセージツリー（parent_id でブランチ、parts JSONB）                                              |
| `chat_files`           | アップロード/生成ファイルメタデータ（id, original_name, stored_path, media_type, size_bytes, message_id, created_at） |
| `artifacts`            | Artifact メタデータ（id, conversation_id FK CASCADE, kind, title, current_version, timestamps）            |
| `artifact_versions`    | Artifact バージョン（artifact_id + version 複合PK, content, command, description）                         |
| `skills`               | スキル（name, description, content, content_dir, enabled, source_type, registry_id）— ファイルベース保存（agentskills.io 準拠）、content_dir → data/skills/{id}/ |
| `ui_config`            | UI設定（single-row、JSONB preferences）— サイドバー状態等の永続化                                          |
| `scheduled_tasks`      | 定時タスク（cron_expr, prompt, kb_slug, allowed_tools, notify_to/from）— task-worker と共有 |
| `task_executions`      | タスク実行履歴（status, tool_calls JSONB, result, error, execution_ms） |
| `task_notifications`   | タスク通知（type: success/failure/timeout, read フラグ） |

- DB: 既存 PostgreSQL (lightrag DB) を共用
- テーブルは初回 API アクセス時に自動作成（`ensureArtifactTables()` / `ensureChatTables()` / `ensureSkillsTables()` / `ensureUiConfigTable()` / `ensureChatFilesTables()` / `ensureSchedulerTables()`）
- 環境変数: `DATABASE_URL` (デフォルト: `postgresql://localhost:5432/lightrag`)

## CRM 商談分析ツール

CRM ツール（listDeals, fetchDealData, analyzeDeal, reviseRationale）はデータ取得・分析ツールとして agent loop 内で動作。分析結果は agent が artifact tool で提案書として出力。

```
listDeals → ユーザーが選択 → fetchDealData → KB/Web 検索 → analyzeDeal → loadSkill('crm-proposal') → show-widget KPI + artifact create（提案書 HTML スライド）
ユーザーフィードバック → reviseRationale → artifact update/rewrite
```

- **決定的スコアリング**: `analyzeDeal` は crm-service `/deals/analyze` に委譲。スコア（winProbability, dealHealthScore, proposalReadiness, activityScore）は `crm-service/src/lib/scoring.ts` の決定的アルゴリズムで算出。AI は定性的根拠（customerChallenges, serviceRecommendations, combinedSolution）のみ生成
- **CRM 提案書ワークフロー**: analyzeDeal 完了後、system prompt のブリッジ指示で `loadSkill('crm-proposal')` を呼出 → KPI ダッシュボード（show-widget）表示 → HTML スライド提案書を artifact で生成
- **`artifact-tool.ts` エスケープ修正**: `unesc()` 関数で LLM JSON 出力のエスケープ済み引用符（`\"` → `"`）を修正。create content, update oldStr/newStr, rewrite content に適用。空白スライド（JS 構文エラー）の根本原因修正
- **System prompt ブリッジ**: 「analyzeDeal の結果が返されたら、loadSkill('crm-proposal') を呼んで提案書ワークフローの指示に従う」

### 内置スキル（built-in-skills/）

起動時に `lib/built-in-skills.ts` が `built-in-skills/` ディレクトリから自動同期（`source_type = "built-in"`）。

| スキル | 説明 |
|--------|------|
| `frontend-design` | フロントエンドデザインガイドライン |
| `html-slides` | HTML スライド生成ルール |
| `crm-proposal` | CRM 分析 → KPI ダッシュボード → 提案書 HTML スライド生成の完全ワークフロー（フロントエンドデザインルール内包） |

## TODO

- [x] 安装 Vercel AI SDK (`ai`, `@ai-sdk/openai`, `zod`)
- [x] 后端 API Routes 实装
- [x] AI Elements チャット UI 实装（Conversation + Message + PromptInput）
- [x] ドキュメント管理サイドバー（アップロード / 一覧 / 削除）
- [x] レスポンシブ対応（モバイル: オーバーレイサイドバー）
- [x] 性能优化（140s → 15s）
- [x] スライド生成 + PPTX エクスポート（完全自包含、AIAgent 依存なし）
- [x] Artifact システム（Claude Artifacts 方式: create/update/rewrite + サイドパネル + バージョン管理 + 流式渲染）
- [x] LLM バックエンド自動切替（Gemini/MLX、UI セレクター廃止）
- [x] チャット履歴永続化（PostgreSQL、サイドバー一覧、`/chat/[id]` ルート）
- [x] メッセージ編集・ブランチ分岐（ツリー構造、ブランチセレクター）
- [x] Tool calling 移行（always-search → LLM 判断、KB 設定動的注入）
- [x] マルチモーダルチャット（画像・テキスト・PDF 添付、D&D、Gemini 直接送信）
- [ ] Docker 部署设定
