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
│       │   └── proposal-pptx.ts    # POST /proposal/generate-pptx
│       └── lib/
│           ├── gemini.ts           # GoogleGenerativeAI wrapper
│           ├── db.ts               # pg Pool + ensureCrmTables()
│           ├── scoring.ts          # 商機評分アルゴリズム
│           ├── prompts.ts          # AI プロンプトビルダー
│           └── types.ts            # SFData, AnalysisResult, etc.
├── lightrag-service/               # Python FastAPI バックエンド
│   ├── Dockerfile                  # python:3.12-slim + uv
│   ├── .dockerignore
│   ├── pyproject.toml              # 依存（pymupdf 追加済み）
│   ├── uv.lock
│   └── app/
│       ├── config.py               # 環境変数設定
│       ├── main.py                 # FastAPI エントリ + lifespan
│       ├── rag.py                  # LightRAG LRU マルチインスタンス + Gemini embedding 速率制限
│       ├── ocr.py                  # OCR（Gemini Vision / GLM-OCR）
│       ├── db.py                   # asyncpg + knowledge_bases + ingest_jobs テーブル
│       └── routers/
│           ├── kbs.py              # CRUD /kbs（ナレッジベース管理）
│           ├── ingest.py           # POST /ingest?kb=（asyncio.Queue 排隊処理）
│           ├── query.py            # POST /query?kb= + /query/search-only?kb=
│           ├── documents.py        # GET/DELETE /documents?kb=
│           └── doc_status.py       # GET /ingest/status/{track_id}?kb=
└── rag-ui/                         # Next.js フロントエンド
    ├── Dockerfile                  # oven/bun:1 + standalone
    ├── .dockerignore
    ├── app/                        # ページ + API Routes
    ├── components/                 # UI コンポーネント
    └── lib/                        # ユーティリティ + プロバイダー
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
| `lightrag-service/app/rag.py` | 同上 | 一致 | Gemini embedding 速率制限 + `workspace=kb_slug`（v1.4.9.11 で namespace→workspace に変更） |
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
| `rag-ui/components/chat-page.tsx` | 同上 | **rag-deploy のみ** | generateProposal 検出 + ProposalPanel + 画像スケルトン + beforeunload ガード |
| `rag-ui/app/api/chat/route.ts` | 同上 | **rag-deploy のみ** | CRM tools + 画像モデルパス（generateText + responseModalities）+ generateImage ツール |
| `rag-ui/lib/constants.ts` | 同上 | **rag-deploy のみ** | CRM_SERVICE_URL 追加 |
| `rag-ui/lib/proposal-panel-store.ts` | **rag-deploy のみ** | — | Zustand store for ProposalPanel |
| `rag-ui/components/proposal-panel.tsx` | **rag-deploy のみ** | — | 提案書生成サイドパネル |
| `rag-ui/app/api/crm/generate-pptx/route.ts` | **rag-deploy のみ** | — | crm-service PPTX 生成プロキシ |
| `crm-service/` | `~/Desktop/AIAgent-performance/` から移植 | — | CRM + 提案書マイクロサービス（Gemini only） |
| `rag-ui/components/documents-page.tsx` | 同上 | 一致 | ドキュメント管理ページ |
| `rag-ui/components/skills-page.tsx` | 同上 | 一致 | スキル CRUD ページ |
| `rag-ui/components/chat-message.tsx` | 同上 | **rag-deploy のみ** | マルチモーダル表示 + AI 生成画像大表示 + generateImage ツール indicator |
| `rag-ui/lib/store.ts` | 同上 | **rag-deploy のみ** | sidebar state + `isImageModel()` + `imageGenerating` 状態（Zustand） |
| `rag-ui/lib/chat-db.ts` | 同上 | 一致 | Chat PostgreSQL CRUD |
| `rag-ui/lib/chat-tree.ts` | 同上 | 一致 | ツリー管理 Zustand ストア |
| `rag-ui/lib/skills-db.ts` | 同上 | 一致 | Skills PostgreSQL CRUD |
| `rag-ui/lib/kb-config-db.ts` | 同上 | 一致 | KB Config PostgreSQL CRUD（single-row） |
| `rag-ui/lib/semantic-cache.ts` | 同上 | 一致 | Valkey 語義キャッシュ（v2 prefix） |
| `rag-ui/lib/constants.ts` | 同上 | 一致 | TAVILY_API_KEY 追加 |
| `rag-ui/lib/file-storage.ts` | 同上 | 一致 | ファイルディスク I/O |
| `rag-ui/lib/chat-files-db.ts` | 同上 | 一致 | chat_files テーブル CRUD |
| `rag-ui/app/api/files/upload/route.ts` | 同上 | 一致 | POST ファイルアップロード |
| `rag-ui/app/api/files/[id]/route.ts` | 同上 | **rag-deploy のみ** | GET ファイル配信 + `?dl=1` ダウンロードモード |
| `rag-ui/hooks/use-file-upload.ts` | 同上 | 一致 | クライアント自動アップロードフック（リトライ対応） |
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
cp -r ~/Desktop/uiForAI/rag-ui/app/api/skills ~/Desktop/uiForAI/rag-deploy/rag-ui/app/api/skills
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
cp ~/Desktop/uiForAI/rag-ui/components/skills-page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/skills-page.tsx
cp ~/Desktop/uiForAI/rag-ui/components/image-lightbox.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/image-lightbox.tsx
# フック
cp -r ~/Desktop/uiForAI/rag-ui/hooks ~/Desktop/uiForAI/rag-deploy/rag-ui/hooks
# ライブラリ
cp ~/Desktop/uiForAI/rag-ui/lib/store.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/store.ts
cp ~/Desktop/uiForAI/rag-ui/lib/chat-db.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/chat-db.ts
cp ~/Desktop/uiForAI/rag-ui/lib/chat-tree.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/chat-tree.ts
cp ~/Desktop/uiForAI/rag-ui/lib/skills-db.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/skills-db.ts
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

ユーザー設定: `.env` の `GEMINI_API_KEY`（必須）+ `TAVILY_API_KEY`（オプション）

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
| crm-service | `GEMINI_MODEL` | gemini-2.5-flash | Gemini モデル |
| crm-service | `DATABASE_URL` | postgresql://raguser:ragpass@postgres:5432/lightrag | DB 接続 |
| crm-service | `SALESFORCE_*` | ${SALESFORCE_*:-} | Salesforce 認証（オプション） |
| crm-service | `KINTONE_*` | ${KINTONE_*:-} | Kintone 認証（オプション） |

### .env（ユーザー設定）

| 変数 | 説明 |
|------|------|
| `GEMINI_API_KEY` | Gemini API Key（必須） |
| `TAVILY_API_KEY` | Tavily API Key（オプション、設定時→Tavily ウェブ検索、未設定→Gemini Google Search grounding にフォールバック） |
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
- **init.sql**: `CREATE EXTENSION vector` のみ。アプリケーションテーブル（ingest_jobs, lightrag_*, slide_*, skills, chat_conversations, chat_messages, chat_files, proposal_templates, crm_deal_cache, proposal_history）は各サービス起動時に自動作成。
- **Embedding 768 次元**: Gemini gemini-embedding-001 は Matryoshka 対応でデフォルト 3072 → 768 に縮小。全新規デプロイのため互換性問題なし。

## 踩坑記録

| 問題 | 原因 | 対処 |
|------|------|------|
| `text-embedding-004 is not found` | Google が v1beta API から廃止 | `gemini-embedding-001` に変更 |
| Embedding 429 RESOURCE_EXHAUSTED | 免費層 100 req/min 制限、LightRAG が entity/relation ごとに embedding 呼出 | `rag.py` に速率制限（Semaphore + interval）追加。付費層なら制限緩和可 |
| 複数ファイル同時アップロードで誤った processed 状態 | LightRAG の `apipeline_process_enqueue_documents` 内部 busy フラグで後続呼出が即 return | `ingest.py` を asyncio.Queue + 単一 worker に改修 |
| ブラウザでファイル選択後リクエストが発生しない | `FileList` は活参照、`input.value=""` で空になる。`Array.from()` 前に clear していた | `Array.from()` でコピー後に clear するよう修正 |
| `NEXT_PUBLIC_LLM_BACKEND=MLX` | build 時に GEMINI_API_KEY 未設定 | `docker compose build --no-cache` で再ビルド |
| `LightRAG.__init__() got an unexpected keyword argument 'namespace'` | lightrag-hku v1.4.9.11 で `namespace` が `workspace` にリネーム | `rag.py` の `namespace=kb_slug` → `workspace=kb_slug` に変更 |
| Gemini OCR 中に他の HTTP リクエストがタイムアウト | `ocr.py` の `client.models.generate_content()` が同期呼出で uvicorn イベントループをブロック | `await client.aio.models.generate_content()` に変更 |
| コンテナ再起動後 extracting 状態のジョブが永久停止 | 再起動で asyncio タスクが消失、復旧ロジックが `processing` のみ対応 | `main.py` lifespan で全非終端ジョブを検出し、track_id 有→再キュー、無→failed マーク |

## トラブルシューティング

| 問題 | 原因 | 対処 |
|------|------|------|
| lightrag unhealthy | Gemini API Key 無効 | `.env` の `GEMINI_API_KEY` を確認 |
| rag-ui が lightrag に接続失敗 | lightrag 未起動 | `docker compose logs lightrag` で確認 |
| PDF アップロード後 failed | Gemini API エラー（Rate limit 等） | `docker compose logs lightrag` で詳細確認 |
| 検索結果が空 | ドキュメント未入庫 or 入庫処理中 | `/api/documents` で status 確認 |
| Embedding 速率制限でスロー | 免費層 API Key | 付費層にアップグレード後、`rag.py` の速率制限を緩和 |
