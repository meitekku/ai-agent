# rag-deploy — RAG 一体化 Docker 部署

Gemini-only の自己完結型 Docker Compose プロジェクト。rag-ui（Next.js フロントエンド）と lightrag-service（Python バックエンド）を PostgreSQL + Valkey と共にパッケージ化。GPU 不要、`GEMINI_API_KEY` のみで任意のマシンにデプロイ可能。

## アーキテクチャ

```
docker-compose.yml
├── rag-ui       (Next.js standalone, Bun)     → port 4002:3000
├── crm-service  (Bun + Hono, NEW)             → port 8009 (internal)
├── lightrag     (Python FastAPI, uv)          → port 8007 (internal)
├── postgres     (pgvector/pgvector:pg18)      → port 5432 (internal)
└── valkey       (valkey/valkey:8)             → port 6379 (internal)
```

外部公開ポートは **4002 のみ**。内部サービス（postgres/valkey/lightrag/crm-service）はホストに公開しない。

## プロジェクト構造

```
rag-deploy/
├── docker-compose.yml              # 5サービス定義
├── .env.example                    # GEMINI_API_KEY テンプレート
├── .env                            # 実際の API Key（git 管理外）
├── init.sql                        # CREATE EXTENSION vector
├── .gitignore                      # .env, node_modules, .venv 等
├── crm-service/                    # CRM + 提案書マイクロサービス (Bun + Hono)
│   ├── Dockerfile                  # oven/bun:1
│   ├── .dockerignore
│   ├── package.json                # hono, pg, @google/generative-ai, jsforce, xlsx, pptxgenjs
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                # Hono app (port 8009) + route registration
│       ├── routes/
│       │   ├── health.ts           # GET /health
│       │   ├── salesforce.ts       # POST /sf/check, /sf/list, /sf/fetch
│       │   ├── kintone.ts          # POST /kintone/list, /kintone/fetch
│       │   ├── parse-file.ts       # POST /deals/parse-file
│       │   ├── analyze.ts          # POST /deals/analyze
│       │   ├── rationale.ts        # POST /deals/revise-rationale
│       │   ├── solution-qa.ts      # POST /deals/solution-qa
│       │   ├── templates.ts        # GET/POST/DELETE/PATCH /templates, POST /templates/detect
│       │   └── proposal-pptx.ts    # POST /proposal/generate-pptx, /generate-plan, /render-pptx, /revise-slide
│       └── lib/
│           ├── gemini.ts           # GoogleGenerativeAI wrapper
│           ├── db.ts               # pg Pool + ensureCrmTables()
│           ├── scoring.ts          # 商機評分アルゴリズム
│           ├── prompts.ts          # AI プロンプトビルダー（buildSlideRevisionPrompt 含む）
│           └── types.ts            # SFData, AnalysisResult, etc.
├── lightrag-service/               # Python FastAPI バックエンド
│   ├── Dockerfile                  # python:3.12-slim + uv
│   ├── .dockerignore
│   ├── pyproject.toml              # 依存（pymupdf 追加済み）
│   ├── uv.lock
│   └── app/
│       ├── config.py               # 環境変数設定
│       ├── main.py                 # FastAPI エントリ + lifespan
│       ├── rag.py                  # LightRAG LRU マルチインスタンス + Gemini embedding 速率制限 + thinking=0 + safety OFF
│       ├── extract.py              # マルチフォーマットテキスト抽出（CSV 構造化対応）
│       ├── ocr.py                  # OCR（Gemini Vision / GLM-OCR）
│       ├── db.py                   # asyncpg + knowledge_bases + ingest_jobs テーブル
│       └── routers/
│           ├── kbs.py              # CRUD /kbs（ナレッジベース管理）
│           ├── ingest.py           # POST /ingest?kb=（asyncio.Queue 排隊処理）
│           ├── query.py            # POST /query?kb= + /query/search-only?kb=
│           ├── documents.py        # GET/DELETE /documents?kb= + POST /documents/{id}/resume
│           └── doc_status.py       # GET /ingest/status/{track_id}?kb=
└── rag-ui/                         # Next.js フロントエンド
    ├── Dockerfile                  # oven/bun:1 + standalone
    ├── .dockerignore
    ├── app/                        # ページ + API Routes
    ├── components/                 # UI コンポーネント
    │   ├── widget-renderer.tsx     # Generative UI: sandbox iframe + morphdom DOM diff
    │   └── widget-shimmer.tsx      # Widget ローディングシマー
    └── lib/                        # ユーティリティ + プロバイダー
        ├── widget-parser.ts        # show-widget フェンス解析
        ├── widget-sanitizer.ts     # HTML 消毒 + iframe srcdoc + morphdom インライン + 逐語アニメーション
        ├── widget-css-bridge.ts    # CSS 変数ブリッジ
        └── widget-guidelines.ts    # Widget システムプロンプト
```

## ソースコード同期状態

rag-deploy は `rag-ui` と `lightrag-service` のコピーをベースに、デプロイ固有の変更を加えたもの。

### 同期方針

- **双方向同期するファイル**: 機能改修はソース側で行い、rag-deploy にコピー。rag-deploy 側で先に修正した場合はソース側にも反映。
- **rag-deploy のみ異なるファイル**: デプロイ固有の変更（Docker 設定、認証情報のデフォルト値変更）。ソースには反映しない。

### ファイル別同期状態

| ファイル | ソース | 同期 | 差分内容 |
|---------|--------|------|---------|
| `lightrag-service/app/config.py` | `~/Desktop/ai/rag-system/lightrag-service/` | **意図的に不一致** | PG デフォルト値: deploy=`raguser/ragpass`、local=個人認証情報 |
| `lightrag-service/app/rag.py` | 同上 | **rag-deploy のみ** | Gemini embedding 速率制限（Semaphore(4) + 0.25s interval）+ `workspace=kb_slug`（v1.4.9.11 で namespace→workspace に変更）+ thinking_budget=0（実体抽出高速化）+ safety_settings OFF（法規文書の誤ブロック防止）+ entity_extract_max_gleaning=1。ソース側は Ollama embedding 使用のため不要 |
| `lightrag-service/app/extract.py` | 同上 | **rag-deploy のみ** | CSV 構造化抽出（エンコード自動検出 + グループ化レコード分割）。ソース側は小規模 CSV のみのため不要 |
| `lightrag-service/app/ocr.py` | 同上 | **rag-deploy のみ** | Gemini OCR async 化（`await client.aio.models.generate_content`）。ソース側は GLM-OCR 使用のため不要 |
| `lightrag-service/app/main.py` | 同上 | **rag-deploy のみ** | stale job recovery 改善（全非終端ステータス対応）。ソース側は PM2 で常駐のため不要 |
| `lightrag-service/app/db.py` | 同上 | **rag-deploy のみ** | `get_stale_jobs()` 追加（recovery 用） |
| `lightrag-service/app/routers/ingest.py` | 同上 | 一致 | asyncio.Queue 排隊処理 |
| `lightrag-service/pyproject.toml` | 同上 | **意図的に不一致** | deploy 版のみ `pymupdf` 追加（Gemini OCR 用） |
| `rag-ui/app/api/chat/route.ts` | `~/Desktop/uiForAI/rag-ui/` | 一致 | tool calling（searchKnowledgeBase + webSearch/readPage/google_search）+ skills injection |
| `rag-ui/lib/ollama-provider.ts` | 同上 | **rag-deploy のみ** | Gemini/MLX 自動切替 + `isImageModel()` + `geminiImageModel` エクスポート |
| `rag-ui/app/api/kb-config/route.ts` | 同上 | 一致 | GET/PUT ナレッジベース設定 |
| `rag-ui/app/api/kb-config/generate/route.ts` | 同上 | 一致 | LLM で KB 設定自動生成 |
| `rag-ui/app/layout.tsx` | 同上 | 一致 | AppShell ラッパー追加 |
| `rag-ui/app/page.tsx` | 同上 | 一致 | / → /new リダイレクト |
| `rag-ui/app/new/page.tsx` | 同上 | 一致 | ChatPage ラッパー |
| `rag-ui/app/chat/[id]/page.tsx` | 同上 | 一致 | 既存チャット（DB ロード → ChatPage） |
| `rag-ui/app/documents/page.tsx` | 同上 | 一致 | ドキュメント管理ルート |
| `rag-ui/app/skills/page.tsx` | 同上 | 一致 | スキル管理ルート |
| `rag-ui/app/api/skills/route.ts` | 同上 | 一致 | GET/POST skills API |
| `rag-ui/app/api/skills/[id]/route.ts` | 同上 | 一致 | PUT/DELETE skills API |
| `rag-ui/app/api/skills/upload/route.ts` | 同上 | 一致 | POST ZIP アップロード |
| `rag-ui/lib/skill-zip-parser.ts` | 同上 | 一致 | ZIP 解析（SKILL.md frontmatter + references） |
| `rag-ui/app/api/history/chats/route.ts` | 同上 | 一致 | GET/POST チャット履歴 |
| `rag-ui/app/api/history/chats/[id]/route.ts` | 同上 | 一致 | GET/PATCH/DELETE 会話 |
| `rag-ui/app/api/history/chats/[id]/messages/route.ts` | 同上 | 一致 | POST メッセージ保存 |
| `rag-ui/components/app-shell.tsx` | 同上 | 一致 | sidebar + header ラッパー |
| `rag-ui/components/app-sidebar.tsx` | 同上 | **rag-deploy のみ** | ナビゲーションサイドバー + チャット履歴 + 画像生成中ナビガード |
| `rag-ui/components/chat-header.tsx` | 同上 | 一致 | usePathname でタイトル切替（/chat 対応） |
| `rag-ui/components/chat-input.tsx` | 同上 | 一致 | ファイル添付（画像・テキスト・PDF）+ プレビュー + D&D |
| `rag-ui/components/chat-page.tsx` | 同上 | **rag-deploy のみ** | fetchAndAnalyze 検出で ProposalPanel 自動開放 + ProposalPanel→SlidePanel 遷移 + 画像スケルトン + beforeunload ガード + reviseSlides 検出 + deckId/slidesSummary 送信 |
| `rag-ui/app/api/chat/route.ts` | 同上 | **rag-deploy のみ** | CRM tools（fetchAndAnalyze 統合 + session 管理、generateProposal 廃止）+ 画像モデルパス + generateImage ツール + reviseSlides ツール（スライド精准編集）+ slide context injection |
| `rag-ui/lib/constants.ts` | 同上 | **rag-deploy のみ** | CRM_SERVICE_URL 追加 |
| `rag-ui/lib/proposal-panel-store.ts` | **rag-deploy のみ** | — | Zustand store（sessionKey + phase + styleOptions 状態管理） |
| `rag-ui/lib/proposal-session.ts` | **rag-deploy のみ** | — | 提案セッション store（PostgreSQL 永続化 + インメモリキャッシュ） |
| `rag-ui/lib/slide-panel-store.ts` | **rag-deploy のみ** | — | Zustand store（cachedSlides + conversationDeckId + refreshToken でスライド持久化・リフレッシュ管理） |
| `rag-ui/lib/slide-db.ts` | **rag-deploy のみ** | — | slide_decks に conversation_id/current_version 追加 + slide_page_versions テーブル + バージョン管理関数 |
| `rag-ui/lib/slide-types.ts` | **rag-deploy のみ** | — | SlideVersion 型追加、SlideDeckDetail に current_version/conversation_id 追加 |
| `rag-ui/lib/slide-api.ts` | **rag-deploy のみ** | — | バージョン API client（fetchSlideVersions, fetchSlidesAtVersion, restoreSlideVersion） |
| `rag-ui/app/api/history/slides/[id]/versions/route.ts` | **rag-deploy のみ** | — | GET バージョン一覧/特定バージョン取得 + POST バージョン復元 |
| `rag-ui/components/proposal-panel.tsx` | **rag-deploy のみ** | — | 提案書パネル（分析表示 → テンプレート確認 → スタイル設定 → SlidePanel へ遷移）PanelShell でリサイズ/モバイル対応 |
| `rag-ui/components/slide-preview.tsx` | **rag-deploy のみ** | — | PresentationPlan → HTML プレビュー（16:9、inch→%変換） |
| `rag-ui/app/api/crm/templates/route.ts` | **rag-deploy のみ** | — | GET/POST crm-service テンプレート一覧・アップロードプロキシ |
| `rag-ui/app/api/crm/generate-pptx/route.ts` | **rag-deploy のみ** | — | crm-service PPTX 生成プロキシ（sessionKey 対応） |
| `rag-ui/app/api/crm/proposal-plan/route.ts` | **rag-deploy のみ** | — | crm-service /proposal/generate-plan プロキシ |
| `rag-ui/app/api/crm/proposal-render/route.ts` | **rag-deploy のみ** | — | crm-service /proposal/render-pptx プロキシ |
| `rag-ui/app/api/crm/proposal-revise-slide/route.ts` | **rag-deploy のみ** | — | crm-service /proposal/revise-slide プロキシ |
| `rag-ui/app/api/crm/proposal-session/[key]/route.ts` | **rag-deploy のみ** | — | GET 提案セッションデータ取得 |
| `crm-service/` | `~/Desktop/AIAgent-performance/` から移植 | — | CRM + 提案書マイクロサービス（Gemini only） |
| `rag-ui/components/documents-page.tsx` | 同上 | 一致 | ドキュメント管理ページ |
| `rag-ui/components/skills-page.tsx` | 同上 | **rag-deploy のみ** | スキル CRUD + skills.sh レジストリ検索/インストール/自動更新 + sonner toast |
| `rag-ui/components/chat-message.tsx` | 同上 | **rag-deploy のみ** | マルチモーダル表示 + AI 生成画像大表示 + generateImage ツール indicator + fetchAndAnalyze インラインボタン + reasoning インライン表示 + reviseSlides indicator + スライド表示ボタン |
| `rag-ui/lib/store.ts` | 同上 | **rag-deploy のみ** | sidebar state + `isImageModel()` + `imageGenerating` 状態（Zustand） |
| `rag-ui/lib/chat-db.ts` | 同上 | 一致 | Chat PostgreSQL CRUD |
| `rag-ui/lib/chat-tree.ts` | 同上 | 一致 | ツリー管理 Zustand ストア |
| `rag-ui/lib/skills-db.ts` | 同上 | **rag-deploy のみ** | Skills PostgreSQL CRUD + `updateSkillByRegistryId()` |
| `rag-ui/lib/skill-registry.ts` | **rag-deploy のみ** | — | skills.sh レジストリ共有ヘルパー（GitHub Tree API で SKILL.md 取得 + frontmatter name マッチ） |
| `rag-ui/app/api/skills/registry/route.ts` | **rag-deploy のみ** | — | GET skills.sh 検索プロキシ |
| `rag-ui/app/api/skills/registry/install/route.ts` | **rag-deploy のみ** | — | POST skills.sh スキルインストール |
| `rag-ui/app/api/skills/registry/update/route.ts` | **rag-deploy のみ** | — | POST registry スキル一括更新（ページ開放時自動実行） |
| `rag-ui/lib/kb-config-db.ts` | 同上 | 一致 | KB Config PostgreSQL CRUD（single-row） |
| `rag-ui/lib/semantic-cache.ts` | 同上 | 一致 | Valkey 語義キャッシュ（v2 prefix） |
| `rag-ui/lib/constants.ts` | 同上 | 一致 | TAVILY_API_KEY 追加 |
| `rag-ui/lib/file-storage.ts` | 同上 | 一致 | ファイルディスク I/O |
| `rag-ui/lib/chat-files-db.ts` | 同上 | 一致 | chat_files テーブル CRUD |
| `rag-ui/app/api/files/upload/route.ts` | 同上 | 一致 | POST ファイルアップロード |
| `rag-ui/app/api/files/[id]/route.ts` | 同上 | **rag-deploy のみ** | GET ファイル配信 + `?dl=1` ダウンロードモード |
| `rag-ui/hooks/use-file-upload.ts` | 同上 | 一致 | クライアント自動アップロードフック（リトライ対応） |
| `rag-ui/components/widget-renderer.tsx` | **rag-deploy のみ** | — | Generative UI: sandbox iframe + morphdom DOM diff + requestAnimationFrame 更新 |
| `rag-ui/components/widget-shimmer.tsx` | **rag-deploy のみ** | — | Widget ローディングシマー |
| `rag-ui/lib/widget-parser.ts` | **rag-deploy のみ** | — | show-widget コードフェンス解析 |
| `rag-ui/lib/widget-sanitizer.ts` | **rag-deploy のみ** | — | Widget HTML 消毒 + iframe srcdoc（morphdom インライン + 逐語アニメーション） |
| `rag-ui/lib/widget-css-bridge.ts` | **rag-deploy のみ** | — | CSS 変数ブリッジ（oklch → widget 変数） |
| `rag-ui/lib/widget-guidelines.ts` | **rag-deploy のみ** | — | Widget 生成システムプロンプト |
| `rag-ui/components/ai-elements/message.tsx` | 同上 | **rag-deploy のみ** | MessageResponse に widget セグメント分割ロジック追加 |
| `rag-ui/app/api/chat/route.ts` | 同上 | **rag-deploy のみ** | CRM tools（fetchAndAnalyze 統合、generateProposal 廃止）+ 画像モデルパス + generateImage + WIDGET_SYSTEM_PROMPT |
| `rag-ui/components/image-lightbox.tsx` | 同上 | **rag-deploy のみ** | shadcn Dialog ベース画像拡大表示 + ダウンロードボタン |
| `rag-ui/lib/file-cleanup.ts` | 同上 | 一致 | 孤立ファイル自動削除 |
| `rag-ui/instrumentation.ts` | 同上 | 一致 | 起動時キャッシュフラッシュ + 孤立ファイルクリーンアップ |
| `rag-ui/` その他全ファイル | 同上 | 一致 | 変更なし |

### 同期コマンド

```bash
# rag-ui の変更を rag-deploy に反映
# ページ・レイアウト
cp ~/Desktop/uiForAI/rag-ui/app/layout.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/app/layout.tsx
cp ~/Desktop/uiForAI/rag-ui/app/page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/app/page.tsx
cp ~/Desktop/uiForAI/rag-ui/app/new/page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/app/new/page.tsx
cp ~/Desktop/uiForAI/rag-ui/app/chat/\[id\]/page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/app/chat/\[id\]/page.tsx
cp ~/Desktop/uiForAI/rag-ui/app/documents/page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/app/documents/page.tsx
cp ~/Desktop/uiForAI/rag-ui/app/skills/page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/app/skills/page.tsx
# API
cp ~/Desktop/uiForAI/rag-ui/app/api/chat/route.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/app/api/chat/route.ts
cp -r ~/Desktop/uiForAI/rag-ui/app/api/kb-config ~/Desktop/uiForAI/rag-deploy/rag-ui/app/api/kb-config
# ⚠️ skills API は個別コピー（registry/ はコピーしない、rag-deploy のみ）
cp ~/Desktop/uiForAI/rag-ui/app/api/skills/route.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/app/api/skills/route.ts
cp ~/Desktop/uiForAI/rag-ui/app/api/skills/\[id\]/route.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/app/api/skills/\[id\]/route.ts
cp ~/Desktop/uiForAI/rag-ui/app/api/skills/upload/route.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/app/api/skills/upload/route.ts
cp ~/Desktop/uiForAI/rag-ui/lib/skill-zip-parser.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/skill-zip-parser.ts
cp -r ~/Desktop/uiForAI/rag-ui/app/api/history/chats ~/Desktop/uiForAI/rag-deploy/rag-ui/app/api/history/chats
# コンポーネント
cp ~/Desktop/uiForAI/rag-ui/components/app-shell.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/app-shell.tsx
cp ~/Desktop/uiForAI/rag-ui/components/app-sidebar.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/app-sidebar.tsx
cp ~/Desktop/uiForAI/rag-ui/components/chat-header.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/chat-header.tsx
cp ~/Desktop/uiForAI/rag-ui/components/chat-input.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/chat-input.tsx
cp ~/Desktop/uiForAI/rag-ui/components/chat-message.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/chat-message.tsx
cp ~/Desktop/uiForAI/rag-ui/components/chat-page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/chat-page.tsx
cp ~/Desktop/uiForAI/rag-ui/components/documents-page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/documents-page.tsx
# ⚠️ skills-page.tsx はコピーしない（rag-deploy のみ skills.sh レジストリ + sonner 追加）
cp ~/Desktop/uiForAI/rag-ui/components/image-lightbox.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/image-lightbox.tsx
# フック
cp -r ~/Desktop/uiForAI/rag-ui/hooks ~/Desktop/uiForAI/rag-deploy/rag-ui/hooks
# ライブラリ
cp ~/Desktop/uiForAI/rag-ui/lib/store.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/store.ts
cp ~/Desktop/uiForAI/rag-ui/lib/chat-db.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/chat-db.ts
cp ~/Desktop/uiForAI/rag-ui/lib/chat-tree.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/chat-tree.ts
# ⚠️ skills-db.ts はコピーしない（rag-deploy のみ updateSkillByRegistryId 追加）
cp ~/Desktop/uiForAI/rag-ui/lib/kb-config-db.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/kb-config-db.ts
cp ~/Desktop/uiForAI/rag-ui/lib/semantic-cache.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/semantic-cache.ts
cp ~/Desktop/uiForAI/rag-ui/lib/constants.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/constants.ts
cp ~/Desktop/uiForAI/rag-ui/lib/file-storage.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/file-storage.ts
cp ~/Desktop/uiForAI/rag-ui/lib/chat-files-db.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/chat-files-db.ts
cp ~/Desktop/uiForAI/rag-ui/lib/file-cleanup.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/file-cleanup.ts
# ファイル API
cp -r ~/Desktop/uiForAI/rag-ui/app/api/files ~/Desktop/uiForAI/rag-deploy/rag-ui/app/api/files
# instrumentation
cp ~/Desktop/uiForAI/rag-ui/instrumentation.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/instrumentation.ts

# lightrag-service の変更を rag-deploy に反映（config.py は除外）
cp ~/Desktop/ai/rag-system/lightrag-service/app/rag.py ~/Desktop/uiForAI/rag-deploy/lightrag-service/app/rag.py
cp ~/Desktop/ai/rag-system/lightrag-service/app/routers/ingest.py ~/Desktop/uiForAI/rag-deploy/lightrag-service/app/routers/ingest.py
# ⚠️ config.py はコピーしない（PG 認証情報が異なるため）
```

## 環境変数

ユーザー設定: `.env` の `GEMINI_API_KEY`（AI Studio 使用時必須）+ `TAVILY_API_KEY`（オプション）+ Vertex AI 設定（オプション）

### docker-compose.yml で設定済み

| サービス | 変数 | 値 | 説明 |
|---------|------|-----|------|
| lightrag | `LLM_PROVIDER` | gemini | LLM バックエンド |
| lightrag | `EMBEDDING_PROVIDER` | gemini | Embedding バックエンド |
| lightrag | `OCR_PROVIDER` | gemini | OCR バックエンド |
| lightrag | `GEMINI_MODEL` | gemini-2.5-flash | LLM モデル |
| lightrag | `GEMINI_EMBEDDING_MODEL` | gemini-embedding-001 | Embedding モデル |
| lightrag | `EMBEDDING_DIM` | 768 | Embedding 次元 |
| lightrag | `PG_HOST/PORT/USER/PASSWORD/DATABASE` | postgres/raguser/ragpass/lightrag | DB 接続 |
| rag-ui | `LIGHTRAG_URL` | http://lightrag:8007 | バックエンド URL |
| rag-ui | `REDIS_URL` | redis://valkey:6379 | キャッシュ URL |
| rag-ui | `EMBEDDING_PROVIDER` | gemini | 語義キャッシュ用 |
| rag-ui | `TAVILY_API_KEY` | ${TAVILY_API_KEY:-} | ウェブ検索（オプション、未設定→Gemini Google Search にフォールバック） |
| rag-ui | `DATABASE_URL` | postgresql://raguser:ragpass@postgres:5432/lightrag | スライド履歴+スキル用 |
| rag-ui | `CRM_SERVICE_URL` | http://crm-service:8009 | CRM サービス URL（設定時→CRM ツール有効） |
| crm-service | `GEMINI_API_KEY` | ${GEMINI_API_KEY} | Gemini API（.env から共有） |
| rag-ui | `GEMINI_MODEL` | gemini-3-flash-preview | デフォルト LLM モデル（チャット別にユーザーが変更可） |
| crm-service | `GEMINI_MODEL` | gemini-3-flash-preview | Gemini モデル（チャットからリクエスト経由で上書き可） |
| crm-service | `DATABASE_URL` | postgresql://raguser:ragpass@postgres:5432/lightrag | DB 接続 |
| crm-service | `SALESFORCE_*` | ${SALESFORCE_*:-} | Salesforce 認証（オプション） |
| crm-service | `KINTONE_*` | ${KINTONE_*:-} | Kintone 認証（オプション） |

### .env（ユーザー設定）

| 変数 | 説明 |
|------|------|
| `GEMINI_API_KEY` | Gemini API Key（AI Studio 使用時必須、Vertex AI 使用時は不要） |
| `TAVILY_API_KEY` | Tavily API Key（オプション、設定時→Tavily ウェブ検索、未設定→Gemini Google Search grounding にフォールバック） |
| `USE_VERTEX_AI` | `true` で Vertex AI 経由に切替（GCP Free Trial credit が使える） |
| `GCP_PROJECT_ID` | GCP プロジェクト ID（Vertex AI 使用時必須） |
| `GCP_LOCATION` | GCP リージョン（デフォルト `global`。Gemini 3.x preview は `global` のみ対応） |
| `GCP_SA_KEY_FILE` | Service Account JSON ファイルパス（Vertex AI 使用時必須、Docker volume mount 用） |
| `SALESFORCE_INSTANCE_URL` | Salesforce インスタンス URL（オプション） |
| `SALESFORCE_CLIENT_ID` | Salesforce クライアント ID（オプション） |
| `SALESFORCE_CLIENT_SECRET` | Salesforce クライアントシークレット（オプション） |
| `KINTONE_SUBDOMAIN` | Kintone サブドメイン（オプション） |
| `KINTONE_API_TOKEN` | Kintone API トークン（オプション） |
| `KINTONE_APP_ID` | Kintone アプリ ID（オプション） |

## コマンド

```bash
# ビルド
docker compose --profile prod build

# 起動
docker compose --profile prod up -d

# 状態確認
docker compose --profile prod ps

# ログ確認
docker compose --profile prod logs -f lightrag
docker compose --profile prod logs -f rag-ui
docker compose --profile prod logs -f crm-service

# 停止
docker compose --profile prod down

# データ含め完全削除
docker compose --profile prod down -v

# 強制再ビルド
docker compose --profile prod build --no-cache
```

## データ永続化

| Volume | マウント先 | 内容 |
|--------|----------|------|
| `pgdata` | /var/lib/postgresql/data | PostgreSQL（ベクトル、KV、ドキュメント、スライド） |
| `valkeydata` | /data | Valkey キャッシュ |
| `lightrag-data` | /app/data | NetworkX グラフファイル |
| `chat-files` | /app/data/chat-files | チャット添付ファイル（画像・PDF 等） |

## リソース使用量

5 コンテナ合計約 **450 MB**（アイドル時）:

| コンテナ | メモリ |
|---------|-------|
| lightrag | ~254 MB |
| rag-ui | ~109 MB |
| crm-service | ~40 MB |
| postgres | ~37 MB |
| valkey | ~10 MB |

## ビルド時の注意

- **rag-ui Dockerfile**: `ARG GEMINI_API_KEY=enabled`（ダミー値）を build 時に渡す。`next.config.ts` の `NEXT_PUBLIC_LLM_BACKEND` は build 時に評価されるため、ダミー値で "Gemini" に確定させる。実際の API Key は runtime の `environment` で注入。
- **init.sql**: `CREATE EXTENSION vector` のみ。アプリケーションテーブル（ingest_jobs, lightrag_*, slide_decks, slide_pages, slide_page_versions, slide_templates, skills, chat_conversations, chat_messages, chat_files, proposal_templates, crm_deal_cache, proposal_history, proposal_sessions）は各サービス起動時に自動作成。
- **Embedding 768 次元**: Gemini gemini-embedding-001 は Matryoshka 対応でデフォルト 3072 → 768 に縮小。全新規デプロイのため互換性問題なし。

## Vertex AI / AI Studio デュアルモード

同じ Gemini モデルに対して 2 つの課金経路がある:

| | AI Studio | Vertex AI |
|--|-----------|-----------|
| エンドポイント | `generativelanguage.googleapis.com` | `aiplatform.googleapis.com` |
| 認証 | `GEMINI_API_KEY` | Service Account JSON |
| GCP Free Trial credit | **使用不可**（明示的に除外） | **使用可** |
| 設定 | `GEMINI_API_KEY=xxx` | `USE_VERTEX_AI=true` + SA JSON |

### 切替方法

`.env` に以下を設定するだけ:
```
USE_VERTEX_AI=true
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=global
GCP_SA_KEY_FILE=./your-sa-key.json
```

### Vertex AI 制約事項

- **GCP_LOCATION=global 必須**: Gemini 3.x preview モデルは `global` のみ対応（`asia-northeast1` 等では 404）
- **Google Search grounding**: Vertex AI モードでは `gemini.tools.googleSearch()` 非対応。ウェブ検索は Tavily（`TAVILY_API_KEY`）が必要
- **コード変更箇所**: `rag.py`, `ocr.py`, `ollama-provider.ts`, `embedding-client.ts`, `slide-provider.ts`, `crm-service/lib/gemini.ts`, `chat/route.ts`（providerOptions key 切替）

## 踩坑記録

| 問題 | 原因 | 対処 |
|------|------|------|
| `text-embedding-004 is not found` | Google が v1beta API から廃止 | `gemini-embedding-001` に変更 |
| 実体抽出が極端に遅い（500 ページ ~2h） | Gemini 2.5 Flash の thinking モードが実体抽出のような構造化タスクでも内部推理を実行し 2-5 倍遅延 | `rag.py` に `thinking_config: {"thinking_budget": 0}` 追加。`entity_extract_max_gleaning=1`（デフォルト維持）。~4 倍高速化 |
| `InvalidResponseError: Gemini response did not contain any text content` で文書が failed | Gemini 2.5 Flash が法規文書の「苦情処理措置」等の実体 summary 生成時に空応答を返す。thinking モード + 安全フィルター誤判定の複合要因 | `rag.py` に `safety_settings: [OFF x 4]` 追加 + thinking=0 で空応答確率を大幅低減。失敗文書は `POST /documents/{id}/resume` で OCR スキップ再処理可能 |
| Embedding 429 RESOURCE_EXHAUSTED | LightRAG が `llm_model_max_async=8` で並列実体抽出 → 各実体/関係ごとに embedding 呼出 → 瞬間数百リクエスト爆発で Tier 1 でも超過 | `rag.py` の `_embed_gemini` に速率制限追加: `Semaphore(4)` + `0.25s` interval → 最大 ~240 RPM に抑制 |
| 複数ファイル同時アップロードで誤った processed 状態 | LightRAG の `apipeline_process_enqueue_documents` 内部 busy フラグで後続呼出が即 return | `ingest.py` を asyncio.Queue + 単一 worker に改修 |
| ブラウザでファイル選択後リクエストが発生しない | `FileList` は活参照、`input.value=""` で空になる。`Array.from()` 前に clear していた | `Array.from()` でコピー後に clear するよう修正 |
| `NEXT_PUBLIC_LLM_BACKEND=MLX` | build 時に GEMINI_API_KEY 未設定 | `docker compose build --no-cache` で再ビルド |
| `LightRAG.__init__() got an unexpected keyword argument 'namespace'` | lightrag-hku v1.4.9.11 で `namespace` が `workspace` にリネーム | `rag.py` の `namespace=kb_slug` → `workspace=kb_slug` に変更 |
| Gemini OCR 中に他の HTTP リクエストがタイムアウト | `ocr.py` の `client.models.generate_content()` が同期呼出で uvicorn イベントループをブロック | `await client.aio.models.generate_content()` に変更 |
| コンテナ再起動後 extracting 状態のジョブが永久停止 | 再起動で asyncio タスクが消失、復旧ロジックが `processing` のみ対応 | `main.py` lifespan で全非終端ジョブを検出し、track_id 有→再キュー、無→failed マーク |
| Widget: streamdown `renderers` API の `isIncomplete` が false に遷移しない | streamdown の CustomRenderer はフェンス完了後も `isIncomplete=true` のまま | streamdown 外で widget 解析する CodePilot 方式に変更。`isStreaming` はフェンス閉じ検出で自前判定 |
| Widget: `tmp.innerHTML` で script 内容が切断される | sandbox iframe 内の `tmp` div で `innerHTML` 解析時に script `textContent` が不完全になるケース | CodePilot 原版の `finalizeHtml`（`tmp` div + `querySelectorAll` + `appendChild`）をそのまま採用 |
| Widget: CDN script の `onload` attribute が動的 script で発火しない場合がある | `setAttribute('onload', ...)` は動的生成 script 要素で不安定 | `addEventListener('load', ...)` + 動的 inline script 生成で対処 |
| Widget: ストリーミング中に `<span` 等の生タグが一瞬表示される | innerHTML が未閉じタグをテキストとして表示 | `sanitizeForStreaming` の最後に `/<[a-zA-Z\/][^>]*$/` で未閉じタグを除去 |
| Widget: テキストが一塊で出現し逐次表示されない | iframe 内で `innerHTML` 全置換 + 120ms throttle | morphdom v2.7.4 インライン（DOM diff で既存ノード保持）+ requestAnimationFrame（毎フレーム更新）+ 逐語 span アニメーション（`[data-wa]` + CSS stagger delay） |
| Widget: 外側カード shadow が overflow:hidden で切断される | WidgetRenderer の外側 div に overflow-hidden + motion アニメーション | motion.div 廃止、overflow-hidden 削除、widget guidelines でフラットデザイン（shadow/border なし）を指示 |
| streamdown math で数式が重複表示される | `@streamdown/math` が KaTeX HTML を生成するが KaTeX CSS 未読込 → MathML 層と視覚層の両方が表示 | `layout.tsx` に `import "katex/dist/katex.min.css"` 追加 |
| CSV アップロードで知識グラフの関係が破壊される | `extract.py` が CSV を 1 枚の巨大 Markdown 表格に変換 → chunk 切割で列ヘッダーと行データが分離 | CSV 構造化抽出に改修: エンコード自動検出(UTF-8/cp932) + グループ列検出 + レコード単位の自然言語ドキュメントに変換。小表格(≤10行×8列)は従来の Markdown 表格を維持 |
| CRM 分析・提案書が KB/Web 情報を参照できない | `analyzeDeal`/`generateProposal` が CRM データのみで分析、KB/Web 検索結果が断絶 | 3 ツール（analyze/revise/pptx）に `additionalContext` パラメータ追加。LLM が事前に KB/Web 検索した情報を渡し、crm-service の Gemini プロンプトに注入 |
| CRM Tool chain が不安定（7 ステップ、~20K tokens） | LLM が 7 tool を順次呼出、KB/Web 検索を飛ばすことがある。データ重複 3 回でトークン浪費 | `fetchAndAnalyze` に統合（CRM fetch + KB 全検索 + Web 検索 + analyze を 1 tool 内で実行）。`generateProposal` は廃止し、`fetchAndAnalyze` の sessionKey 返却で ProposalPanel が自動開放。2 tool、~6K tokens に削減 |
| PPTX 一発生成でプレビュー/修正不可 | `/proposal/generate-pptx` が plan 生成 + PPTX レンダリングを一括実行 | 3 エンドポイントに分割: `/generate-plan`（JSON のみ）+ `/revise-slide`（1 スライド修正）+ `/render-pptx`（PPTX レンダリング）。ProposalPanel で分析表示 → テンプレート確認 → スタイル設定 → SlidePanel へ遷移 |
| crm-service PPTX 計画 JSON が切れる | Gemini の maxOutputTokens 不足 + 長い JSON が途中で途切れる | maxTokens 8000→16000 に増量 + 切断 JSON 自動修復（未閉じ括弧を自動補完） |
| `reviseRationale` がセッション分析を上書き | セッションの analysis 全体を revise 結果で置換、元のスコアが消える | マージ方式に変更: `result.rationale` + `result.analysisUpdates` を既存 analysis にマージ |
| `kbs.find()` でクラッシュ | API レスポンスが `{ knowledge_bases: [...] }` なのに配列として参照 | `data.knowledge_bases ?? data ?? []` でアンラップ |
| PDF エクスポートでテキスト消失 | PDF export が innerHTML コピー時に computed styles を未コピー | `captureSlideAsPng()` で iframe 内直接キャプチャに変更（PPTX/PDF 共通） |
| PPTX がプレビューと異なる | innerHTML を外部 wrapper にコピー → Tailwind CSS が外部 DOM に不在 | iframe 内の body に直接 html2canvas 実行（same-origin srcdoc） |
| PDF 保存時に PPTX ボタンが回る | PDF/PPTX が `exporting` state を共有 | `exportingPdf` 独立 state 追加、各ボタンに専用 spinner |
| 提案書に受注率等の内部データ | `buildProposalContent` / `buildPptxPrompt` が内部スコアを含む | 顧客向けコンテンツから除外、PPTX prompt に禁止リスト明記 |
| 全案件で 3 サービス全推薦 | prompt にサービス選別ルールなし | 「関連サービスのみ推薦、無関係なら含めない」ルール追加 |
| セッション期限切れで提案書パネル無限 loading | `proposal-session.ts` がインメモリ Map + TTL 1h | PostgreSQL 永続化に変更。メモリキャッシュ + DB fallback |
| スライドのデザインがページごとにバラバラ | 各スライド独立並列生成、全体コンテキストなし | render prompt に「デッキ全体のデザイン統一ルール」追加 |
| styleOptions がスライド生成に反映されない | `renderSlides()` が styleOptions を受け取らず API に未送信 | `renderSlides()` に styleOptions パラメータ追加、render API body に含める |
| fetchAndAnalyze が crm-service 障害で全失敗 → ProposalPanel 開かず | `generateRationale()` が Gemini API エラーを catch せず throw → analyze endpoint が 500 返却 → fetchAndAnalyze が `{ error }` 返却 → detection effect が sessionKey を検出できず | 2 箇所修正: (1) `generateRationale()` に外側 try-catch 追加（Gemini 失敗時 fallback rationale 返却）(2) `fetchAndAnalyze` の analyze 呼出に try-catch 追加（失敗時もスコアリング結果なしで sessionKey 生成 → ProposalPanel は必ず開く） |

## トラブルシューティング

| 問題 | 原因 | 対処 |
|------|------|------|
| lightrag unhealthy | Gemini API Key 無効 | `.env` の `GEMINI_API_KEY` を確認 |
| rag-ui が lightrag に接続失敗 | lightrag 未起動 | `docker compose logs lightrag` で確認 |
| PDF アップロード後 failed | Gemini API エラー（Rate limit 等） | `docker compose logs lightrag` で詳細確認 |
| 検索結果が空 | ドキュメント未入庫 or 入庫処理中 | `/api/documents` で status 確認 |
| Embedding 速率制限でスロー | Tier 1 でも LightRAG 並列処理で RPM 超過 | `rag.py` に Semaphore(4) + 0.25s interval 実装済み。上位 Tier なら `_embed_sem` と `_embed_interval` を調整可 |
