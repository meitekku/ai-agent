# rag-ui — RAG チャット前端

**后端**: LightRAG (:8007, 主要)
**LLM**: Gemini API（默认） / MLX qwen3.5-35B-A3B (:8008, フォールバック) — `GEMINI_API_KEY` の有無で自動切替
**外部端口**: 4002（容器内 3000）

## 技术栈

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- shadcn/ui（已初始化）
- AI Elements（`ai-elements`）— Conversation, Message, PromptInput コンポーネント
- Vercel AI SDK (`ai` v6) — ToolLoopAgent + useChat
- `@ai-sdk/react` — useChat フック
- `@ai-sdk/openai` — MLX OpenAI 互換プロバイダー（フォールバック用）
- `@ai-sdk/google` — Gemini プロバイダー
- `streamdown` — Markdown レンダリング（CJK, code, math, mermaid プラグイン）
- Bun

## 架构

```
Browser useChat → /api/chat Route Handler → Valkey cache check
                                          → Gemini/MLX ToolLoopAgent + tool calling
                                            → searchKnowledgeBase（LightRAG search-only）
                                            → webSearch / readPage（Tavily）or google_search（Gemini grounding）
                                          → Valkey cache write
```

- マルチモーダル対応：画像・テキスト・PDF を添付可能（サーバーアップロード → URL 参照 → DB 軽量化）
- ファイルはドラッグ&ドロップ / クリップボード貼り付け / ボタン選択で添付
- ファイルアップロード: 添付時に即座に `/api/files/upload` → ディスク保存 → DB には URL 参照のみ保存
- チャット送信時: `resolveServerFiles()` がモデルメッセージ内のサーバー URL / data URL → `Uint8Array` バイナリ変換 → Gemini API へ送信
- 画像表示: `<img src="/api/files/{id}">` でサーバーから直接配信（immutable cache）、クリックで shadcn Dialog ライトボックス拡大
- 孤立ファイル自動削除: 起動時 + 6時間ごとに未参照ファイル（60分以上）をクリーンアップ
- 会話削除時にファイルもカスケード削除（DB + ディスク）
- Chat は tool-calling 方式：LLM が質問内容に応じて searchKnowledgeBase ツールの使用を判断
- `kb_config` テーブルで KB の title + description を管理 → ツール description に動的注入
- 一般的な挨拶・雑談はツールを使わず直接回答（不要な RAG 検索をスキップ）
- ウェブ検索自動フォールバック: `TAVILY_API_KEY` 設定時→Tavily（webSearch+readPage）、未設定時→Gemini Google Search grounding（`google_search`）、どちらもなし→KB 検索のみ
- 文档上传（異步）: rag-ui → LightRAG /ingest → OCR 完了即応答 → 後台 LLM 実体抽出
- 前端 5秒ポーリングで入庫状態更新（processing → processed / failed）
- 文档管理 API 直接代理到 LightRAG 服务（/documents 含 status 字段）

## LLM 后端自動切替

`GEMINI_API_KEY` の有無で自動的に LLM バックエンドを選択。UI でのバックエンド切替は廃止。

| 条件                        | バックエンド | 説明                                       |
| --------------------------- | ------------ | ------------------------------------------ |
| `GEMINI_API_KEY` が設定済み | **Gemini**   | gemini-2.5-flash（クラウド）               |
| `GEMINI_API_KEY` が未設定   | **MLX**      | Qwen3.5-35B-A3B-4bit（ローカル port 8008） |

- 判定ロジック: `lib/ollama-provider.ts` の `getChatModel()` / `useGemini`
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
| `GEMINI_MODEL`           | gemini-2.5-flash                     | Gemini LLM 模型                                             |
| `GEMINI_EMBEDDING_MODEL` | text-embedding-004                   | Gemini Embedding 模型                                       |
| `EMBEDDING_PROVIDER`     | local                                | Embedding 提供者（`local` / `gemini`）                      |
| `SLIDE_LLM_BASE_URL`     | (空)                                 | スライド専用 LLM ベース URL（設定時は専用プロバイダー使用） |
| `SLIDE_LLM_API_KEY`      | (空)                                 | スライド専用 LLM API Key                                    |
| `SLIDE_LLM_MODEL`        | (空)                                 | スライド専用 LLM モデル名                                   |
| `DATABASE_URL`           | postgresql://localhost:5432/lightrag | PostgreSQL 接続 URL（スライド履歴・テンプレート保存用）     |

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
│       ├── chat/route.ts              # ToolLoopAgent + tool calling + Valkey cache + skills injection
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
│       │   └── upload/route.ts        # POST ZIP スキルアップロード
│       ├── history/chats/
│       │   ├── route.ts               # GET/POST チャット履歴一覧/新規作成
│       │   └── [id]/
│       │       ├── route.ts           # GET/PATCH/DELETE 会話詳細/更新/削除
│       │       └── messages/route.ts  # POST メッセージ保存
│       ├── documents/
│       │   ├── route.ts               # GET 文档列表
│       │   ├── upload/route.ts        # POST PDF 上传
│       │   └── [id]/route.ts          # DELETE 文档删除
│       ├── slides/
│       │   ├── plan/route.ts          # POST 簡易スライド構成計画
│       │   ├── render/route.ts        # POST 簡易スライド HTML 生成
│       │   ├── generate/route.ts      # POST 構造化デッキ JSON（Zod）
│       │   ├── pptx/route.ts          # POST PPTX 生成（2モード）
│       │   ├── pdf/route.ts           # POST PDF 生成（jsPDF）
│       │   ├── refine/route.ts        # POST AI デッキリファイン
│       │   ├── visual/
│       │   │   ├── outline/route.ts   # POST ビジュアルアウトライン生成
│       │   │   └── renderhtml/route.ts # POST ビジュアルスライド HTML 生成
│       │   └── htmlslide/
│       │       ├── plan/route.ts      # POST HTML スライド構成計画（スタイル対応）
│       │       └── render/route.ts    # POST HTML スライド生成（テンプレート対応）
│       ├── history/
│       │   └── slides/
│       │       ├── route.ts           # GET/POST スライド履歴
│       │       └── [id]/route.ts      # GET/PUT/PATCH/DELETE 個別デッキ
│       └── templates/
│           └── slides/
│               ├── route.ts           # GET/POST テンプレート
│               └── [id]/route.ts      # DELETE テンプレート
├── components/
│   ├── ui/                    # shadcn コンポーネント（コマンド生成、手動変更不可）
│   ├── ai-elements/           # AI Elements コンポーネント（コマンド生成）
│   ├── chat-input.tsx         # チャット入力（ファイル添付、アップロード進捗、D&D、リトライ対応）
│   ├── chat-message.tsx       # チャットメッセージ（マルチモーダル表示、正方形サムネイル、shadcn Dialog ライトボックス、4モードドロップダウン）
│   ├── image-lightbox.tsx     # shadcn Dialog ベース画像拡大表示
│   ├── slide-viewer.tsx       # 簡易スライドビューア（既存）
│   ├── visual-slide-viewer.tsx # ビジュアルスライドビューア（7スタイル、outline→HTML）
│   ├── html-slide-viewer.tsx  # HTML スライドビューア（DB保存、テンプレート、ドラッグ）
│   ├── slide-studio.tsx       # スライドスタジオ（構造化編集、Mermaid、PPTX）
│   ├── style-options-panel.tsx # スタイルオプション（産業/職種/年代/色/フォント）
│   ├── template-manager.tsx   # テンプレート管理モーダル
│   ├── app-shell.tsx           # AppShell（sidebar + header ラッパー、layout から使用）
│   ├── app-sidebar.tsx        # ナビゲーションサイドバー（overlay/pinned、チャット履歴）
│   ├── chat-page.tsx          # チャット共有コンポーネント（履歴+ブランチ統合）
│   ├── documents-page.tsx     # ナレッジベース一覧ページ
│   ├── kb-detail-page.tsx     # ナレッジベース詳細（ドキュメント管理+設定編集）
│   └── skills-page.tsx        # スキル CRUD + ZIP アップロードページコンポーネント
├── lib/
│   ├── utils.ts           # shadcn 自動生成
│   ├── store.ts           # Zustand store（sidebar 状態管理）
│   ├── chat-db.ts         # PostgreSQL チャット会話CRUD（pg）
│   ├── chat-tree.ts       # Zustand ツリー管理（ブランチ操作、パス計算）
│   ├── ui-config-db.ts    # PostgreSQL UI設定CRUD（single-row、JSONB preferences）
│   ├── constants.ts       # 環境変数定義
│   ├── rag-client.ts      # LightRAG/QueryService HTTP クライアント
│   ├── ollama-provider.ts # AI SDK プロバイダー設定（Gemini/MLX 自動切替）
│   ├── embedding-client.ts # Embedding クライアント（Ollama/Gemini 切替）
│   ├── semantic-cache.ts  # Valkey/Redis 查询缓存（TTL 1h）
│   ├── slide-provider.ts  # スライド LLM プロバイダー（Gemini/MLX 自動切替）
│   ├── slide-prompts.ts   # スライド生成プロンプト + バリデーション
│   ├── slide-store.ts     # 簡易スライド状態管理（Zustand）
│   ├── skills-db.ts       # PostgreSQL スキルCRUD（pg、source_type 列対応）
│   ├── skill-zip-parser.ts # ZIP スキル解析（SKILL.md frontmatter + references）
│   ├── slide-db.ts        # PostgreSQL スライドCRUD（pg）
│   ├── slide-types.ts     # スライド共有型定義
│   ├── slide-api.ts       # フロントエンド API クライアント（履歴/テンプレート）
│   ├── file-storage.ts    # ファイルディスク I/O（保存/読込/パス解決）
│   ├── chat-files-db.ts   # chat_files テーブル CRUD
│   └── file-cleanup.ts    # 孤立ファイル自動削除
├── hooks/
│   └── use-file-upload.ts # クライアント自動アップロード（XHR 進捗、リトライ対応）
├── instrumentation.ts     # 起動時キャッシュフラッシュ + 孤立ファイルクリーンアップ
├── next.config.ts         # output: "standalone" + env.NEXT_PUBLIC_LLM_BACKEND
├── CLAUDE.md
└── README.md
```

**注意**: 本项目未使用 `src/` 目录，app/components/lib 直接在根目录下。

## ページルーティング

| パス         | 説明                                           |
| ------------ | ---------------------------------------------- |
| `/`          | `/new` にリダイレクト                          |
| `/new`       | 新規チャット                                   |
| `/chat/[id]` | 既存チャット（DB からロード、ブランチ対応）    |
| `/documents` | ナレッジベース一覧                             |
| `/documents/[slug]` | ナレッジベース詳細（ドキュメント管理）   |
| `/skills`    | スキル管理（CRUD + 有効/無効切替）             |

- `AppShell`（sidebar + header）は `layout.tsx` で全ページ共通
- sidebar は `usePathname()` でアクティブなナビを判定 + チャット履歴一覧表示
- header は `usePathname()` でタイトル/アイコンを切替
- `/new` で初回送信後、`replaceState` で `/chat/[id]` に URL 更新（リマウントなし）

## API Routes

| メソッド             | パス                             | 説明                                                       |
| -------------------- | -------------------------------- | ---------------------------------------------------------- |
| POST                 | /api/chat                        | AI チャット（ToolLoopAgent + tool calling + Valkey cache + resolveServerFiles） |
| POST                 | /api/files/upload                | ファイルアップロード（multipart/form-data → ディスク保存 + DB 記録） |
| GET                  | /api/files/[id]                  | ファイル配信（immutable cache、Content-Type 付き）         |
| GET/POST             | /api/kbs                         | ナレッジベース一覧 / 新規作成                              |
| GET/PUT/DELETE       | /api/kbs/[slug]                  | ナレッジベース詳細 / 更新 / 削除                           |
| POST                 | /api/kbs/[slug]/generate         | LLM で title+description 自動生成                          |
| GET/PUT              | /api/ui-config                   | UI設定（サイドバー状態等、JSONB preferences）              |
| GET                  | /api/documents                   | 文档列表                                                   |
| POST                 | /api/documents/upload            | PDF 上传（→ LightRAG /ingest）                             |
| DELETE               | /api/documents/[id]              | 文档削除（→ LightRAG 知識グラフ+ベクトル完全削除）         |
| GET/POST             | /api/skills                      | スキル一覧 / 新規作成                                      |
| PUT/DELETE           | /api/skills/[id]                 | スキル更新 / 削除                                          |
| POST                 | /api/skills/upload               | ZIP スキルアップロード（SKILL.md + references）            |
| GET/POST             | /api/history/chats               | チャット履歴一覧 / 新規会話作成                            |
| GET/PATCH/DELETE     | /api/history/chats/[id]          | 会話詳細 / 更新 / 削除                                     |
| POST                 | /api/history/chats/[id]/messages | メッセージ保存 + active_leaf_id 更新                       |
| POST                 | /api/slides/plan                 | 簡易スライド構成計画                                       |
| POST                 | /api/slides/render               | 簡易スライド HTML 生成                                     |
| POST                 | /api/slides/generate             | 構造化デッキ JSON 生成（generateObject + Zod）             |
| POST                 | /api/slides/pptx                 | PPTX 生成（Mode A: 画像 / Mode B: 構造化）                 |
| POST                 | /api/slides/pdf                  | PDF 生成（jsPDF landscape）                                |
| POST                 | /api/slides/refine               | AI デッキリファイン（generateObject）                      |
| POST                 | /api/slides/visual/outline       | ビジュアルアウトライン生成                                 |
| POST                 | /api/slides/visual/renderhtml    | ビジュアルスライド HTML 生成                               |
| POST                 | /api/slides/htmlslide/plan       | HTML スライド構成計画（スタイル+テンプレート対応）         |
| POST                 | /api/slides/htmlslide/render     | HTML スライド生成（テンプレート参考対応）                  |
| GET/POST             | /api/history/slides              | スライド履歴一覧 / 新規保存                                |
| GET/PUT/PATCH/DELETE | /api/history/slides/[id]         | スライドデッキ詳細/更新/リネーム/削除                      |
| GET/POST             | /api/templates/slides            | テンプレート一覧 / 保存                                    |
| DELETE               | /api/templates/slides/[id]       | テンプレート削除                                           |

## 开发命令

```bash
bun dev              # 開発サーバー起動
bun run build        # ビルド
bun run lint         # ESLint
bun run format       # Prettier フォーマット
bun run format:check # Prettier チェック
```

## 已安装 shadcn 组件

button, badge, card, input, textarea, dropdown-menu, label, separator, select, alert-dialog, input-group, field, combobox, tooltip, hover-card, spinner, dialog, button-group, command, switch, scroll-area, tabs

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

## スライド機能（4モード）

チャット回答からスライドを自動生成。ドロップダウンメニューから4種類のビューアを選択可能。

### 4つのスライドモード

| モード                 | コンポーネント    | 特徴                                                        | DB保存 |
| ---------------------- | ----------------- | ----------------------------------------------------------- | ------ |
| **HTML スライド**      | HtmlSlideViewer   | スタイルオプション、テンプレート、ドラッグ編集、DB保存/履歴 | あり   |
| **ビジュアルスライド** | VisualSlideViewer | 7種風格プリセット、outline→HTML、contentEditable            | なし   |
| **スライドスタジオ**   | SlideStudio       | 構造化編集（bullets/表/チャート/Mermaid）、AI Refine        | なし   |
| **簡易スライド**       | SlideViewer       | 既存のシンプルなプレビュー+PPTX                             | なし   |

### データフロー

```
回答下のドロップダウンメニュー → 4モード選択

[HTML スライド]
  → POST /api/slides/htmlslide/plan（スタイルオプション対応）
  → POST /api/slides/htmlslide/render × N（テンプレート参考対応）
  → ドラッグ/フォント/ズーム編集
  → DB保存（slide_decks + slide_pages）
  → PPTX/PDF エクスポート

[ビジュアルスライド]
  → POST /api/slides/visual/outline（JSON アウトライン生成）
  → 7スタイルプリセット選択
  → POST /api/slides/visual/renderhtml × N（or PPTX Native ローカル生成）
  → contentEditable 編集 + 再描画
  → PPTX エクスポート

[スライドスタジオ]
  → POST /api/slides/generate（Zod schema → 構造化 deck）
  → GUI 編集（title/bullets/table/chart/mermaid/notes）
  → POST /api/slides/refine（AI リファイン）
  → PPTX エクスポート（Mode B 構造化）

[簡易スライド] — 既存フロー
  → POST /api/slides/plan → /api/slides/render × N → PPTX
```

### PostgreSQL テーブル（9表）

| テーブル             | 用途                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `chat_conversations` | チャット会話（id, title, active_leaf_id, timestamps）                                                      |
| `chat_messages`      | チャットメッセージツリー（parent_id でブランチ、parts JSONB）                                              |
| `chat_files`         | アップロードファイルメタデータ（id, original_name, stored_path, media_type, size_bytes, created_at）       |
| `slide_decks`        | デッキメタデータ（title, question, answer, plan_md, style_options JSONB）                                  |
| `slide_pages`        | 個別スライド（deck_id FK CASCADE, slide_index, title, html, plan_text）                                    |
| `slide_templates`    | テンプレート（name, position, html, UNIQUE(name, position)）                                               |
| `skills`             | スキル（name, description, content, enabled, source_type）— システムプロンプト注入用、ZIP アップロード対応 |
| `ui_config`          | UI設定（single-row、JSONB preferences）— サイドバー状態等の永続化                                          |

- DB: 既存 PostgreSQL (lightrag DB) を共用
- テーブルは初回 API アクセス時に自動作成（`ensureChatTables()` / `ensureSlideTables()` / `ensureSkillsTables()` / `ensureUiConfigTable()` / `ensureChatFilesTables()`）
- 環境変数: `DATABASE_URL` (デフォルト: `postgresql://localhost:5432/lightrag`)

### PPTX/PDF エクスポート

| モード               | 入力                   | 出力                 | 特徴                 |
| -------------------- | ---------------------- | -------------------- | -------------------- |
| **Mode A**（画像）   | `pngs[]` data URL 配列 | 画像スライド         | 見た目忠実、編集不可 |
| **Mode B**（構造化） | `deck` JSON            | テキスト+チャート+表 | 編集可能、PptxGenJS  |
| **PDF**              | `pngs[]` data URL 配列 | Landscape PDF        | jsPDF                |

### スライド LLM プロバイダー

`lib/slide-provider.ts` — 優先順位:

1. `SLIDE_LLM_*` 環境変数 → 専用プロバイダー
2. `GEMINI_API_KEY` 設定済み → Gemini
3. フォールバック → MLX

## TODO

- [x] 安装 Vercel AI SDK (`ai`, `@ai-sdk/openai`, `zod`)
- [x] 后端 API Routes 实装
- [x] AI Elements チャット UI 实装（Conversation + Message + PromptInput）
- [x] ドキュメント管理サイドバー（アップロード / 一覧 / 削除）
- [x] レスポンシブ対応（モバイル: オーバーレイサイドバー）
- [x] 性能优化（140s → 15s）
- [x] スライド生成 + PPTX エクスポート（完全自包含、AIAgent 依存なし）
- [x] AIAgent スライド UI 移植（4モード: HTML/Visual/Studio/Simple + PostgreSQL 持久化）
- [x] LLM バックエンド自動切替（Gemini/MLX、UI セレクター廃止）
- [x] チャット履歴永続化（PostgreSQL、サイドバー一覧、`/chat/[id]` ルート）
- [x] メッセージ編集・ブランチ分岐（ツリー構造、ブランチセレクター）
- [x] Tool calling 移行（always-search → LLM 判断、KB 設定動的注入）
- [x] マルチモーダルチャット（画像・テキスト・PDF 添付、D&D、Gemini 直接送信）
- [ ] Docker 部署设定
