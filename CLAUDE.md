# rag-deploy — RAG 一体化 Docker 部署

Gemini-only の自己完結型 Docker Compose プロジェクト。rag-ui（Next.js フロントエンド）と lightrag-service（Python バックエンド）を PostgreSQL + Valkey と共にパッケージ化。GPU 不要、`GEMINI_API_KEY` のみで任意のマシンにデプロイ可能。

## アーキテクチャ

```
docker-compose.yml
├── rag-ui        (Next.js standalone, Bun)     → port 4002:3000
├── crm-service   (Bun + Hono)                  → port 8009 (internal)
├── task-worker   (Bun + Hono, NEW)             → port 8010 (internal)
├── opensandbox   (Python FastAPI, NEW)         → port 8080 (internal)
├── lightrag      (Python FastAPI, uv)          → port 8007 (internal)
├── postgres      (pgvector/pgvector:pg18)      → port 5432 (internal)
└── valkey        (valkey/valkey:8)             → port 6379 (internal)
```

外部公開ポートは **4002 のみ**。内部サービス（postgres/valkey/lightrag/crm-service/task-worker/opensandbox）はホストに公開しない。

## デプロイ環境

### 本番（EC2） — AI博覧会デモ用

| 項目 | 値 |
|------|-----|
| URL | https://ai.agent.kakiage-kun.jp |
| Instance | `i-0789466d74768eaf9` t4g.medium (ARM64, 2C/4GB, 30GB gp3) |
| Elastic IP | `35.74.76.156` |
| Region | ap-northeast-1 |
| Nginx | 80/443 → localhost:4002, Let's Encrypt SSL (auto-renew) |
| 定時開閉 | EventBridge Scheduler: 08:00 JST start / 22:00 JST stop |
| SSH | `ssh -i ~/.ssh/rag-deploy-key.pem ec2-user@35.74.76.156` |

### 開発（Orange Pi） — 社内常駐

| 項目 | 値 |
|------|-----|
| SSH | `ssh zwg@100.106.83.107` |
| Dir | `~/rag-deploy` |

## CI/CD — GitHub Actions (Self-hosted Mac Runner)

2 つのリポジトリが同じ Mac 上の別々の runner でビルドし、異なるターゲットにデプロイ:

| リポジトリ | remote | Runner | デプロイ先 |
|-----------|--------|--------|-----------|
| `wgzhaocv/rag-deploy` | `origin` | `~/actions-runner` | Orange Pi |
| `FGjp-techdes/ai-agent-v2` | `fg` | `~/actions-runner-ec2` | EC2 |

Mac (ARM64) でビルド → `docker save` + `scp` → ターゲットで `docker load` + `up -d`。
`github.repository` で分岐し、同一 `deploy.yml` で両方のフローを定義。

## プロジェクト構造

```
rag-deploy/
├── docker-compose.yml              # 7サービス定義
├── .env.example                    # GEMINI_API_KEY テンプレート
├── .env                            # 実際の API Key（git 管理外）
├── init.sql                        # CREATE EXTENSION vector
├── .gitignore                      # .env, node_modules, .venv 等
├── task-worker/                     # 定時タスク実行ワーカー (Bun + Hono)
│   ├── Dockerfile                  # oven/bun:1
│   ├── .dockerignore
│   ├── package.json                # hono, pg, redis, ai, @ai-sdk/google, @ai-sdk/google-vertex, @alibaba-group/opensandbox, croner, resend
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                # Hono app (port 8010) + worker loop start
│       ├── routes/
│       │   └── health.ts           # GET /health
│       └── lib/
│           ├── db.ts               # pg Pool + ensureTables()
│           ├── ai-provider.ts      # Gemini/Vertex AI プロバイダー切替 + getModel() + getImageModel() + googleSearchTool
│           ├── skills-db.ts        # PostgreSQL スキル読取（getEnabledSkillSummaries / getSkillByName）
│           ├── worker.ts           # BRPOP 消費ループ + stale recovery
│           ├── executor.ts         # AI tool-loop 実行エンジン（skills注入 + KB auto-discovery + google_search追加）
│           ├── tools.ts            # ツール実装（loadSkill / generateImage / KB auto-discovery 対応）
│           ├── sandbox.ts          # OpenSandbox SDK wrapper + /output/ 自動抽出ストリーミングアップロード
│           ├── notify.ts           # task_notifications テーブル書込
│           ├── email.ts            # Resend + React Email（タスク完了通知）
│           └── emails/
│               ├── task-result.tsx  # タスク完了通知メールテンプレート
│               └── ai-email.tsx    # AI sendEmail ツール用メールテンプレート（Markdown 対応）
├── opensandbox/                     # OpenSandbox サーバー (Alibaba, Apache 2.0)
│   ├── Dockerfile                  # python:3.12-slim + opensandbox-server
│   ├── Dockerfile.sandbox-python   # sandbox Python イメージ（CLI + Python ライブラリ多数）
│   └── config.toml                 # server/docker/security 設定
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
    │   ├── widget-shimmer.tsx      # Widget ローディングシマー
    │   ├── scheduler-shared.tsx    # スケジューラ共通（型定義, cron helpers, SchedulePicker, TaskFormFields）
    │   ├── scheduler-page.tsx      # スケジューラ一覧ページ
    │   ├── scheduler-detail-page.tsx # スケジューラ詳細ページ（データ取得+レイアウトのみ）
    │   └── scheduler/              # スケジューラ詳細サブコンポーネント（各 memo'd + Zustand 分離）
    │       ├── task-info-card.tsx   # タスク情報カード
    │       ├── execution-list.tsx   # 実行履歴リスト（自身で useQuery + 15s ポーリング）
    │       ├── execution-result-dialog.tsx # 実行結果ダイアログ
    │       ├── edit-dialog.tsx      # 編集ダイアログ
    │       └── delete-dialog.tsx    # 削除確認ダイアログ
    └── lib/                        # ユーティリティ + プロバイダー
        ├── scheduler-detail-store.ts # Zustand store（ダイアログ状態管理、型定義）
        ├── widget-parser.ts        # show-widget フェンス解析
        ├── widget-sanitizer.ts     # HTML 消毒 + iframe srcdoc + morphdom インライン + 逐語アニメーション
        ├── widget-css-bridge.ts    # CSS 変数ブリッジ
        └── widget-guidelines.ts    # Widget システムプロンプト
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
| rag-ui | `TASK_WORKER_URL` | http://task-worker:8010 | タスクワーカー URL（設定時→スケジューラツール有効） |
| task-worker | `GEMINI_API_KEY` | ${GEMINI_API_KEY} | Gemini API（.env から共有） |
| task-worker | `GEMINI_MODEL` | gemini-3-flash-preview | Gemini モデル |
| task-worker | `DATABASE_URL` | postgresql://raguser:ragpass@postgres:5432/lightrag | DB 接続 |
| task-worker | `REDIS_URL` | redis://valkey:6379 | Valkey キュー接続 |
| task-worker | `LIGHTRAG_URL` | http://lightrag:8007 | KB 検索用 |
| task-worker | `CRM_SERVICE_URL` | http://crm-service:8009 | CRM API 用 |
| task-worker | `OPENSANDBOX_URL` | opensandbox:8080 | コード実行サンドボックス |
| task-worker | `RESEND_API_KEY` | ${RESEND_API_KEY:-} | メール通知（オプション） |

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
| `RESEND_API_KEY` | Resend API Key（オプション、定時タスクのメール通知用） |
| `EMAIL_FROM` | メール送信元（例: `FleGrowth AI エージェント <noreply@ai.agent.kakiage-kun.jp>`） |
| `APP_URL` | アプリ URL（例: `https://ai.agent.kakiage-kun.jp`） |

## コマンド

```bash
# ── ローカル ──
docker compose --profile prod build
docker compose --profile prod up -d
docker compose --profile prod ps
docker compose --profile prod logs -f lightrag
docker compose --profile prod down
docker compose --profile prod down -v          # データ含め完全削除
docker compose --profile prod build --no-cache # 強制再ビルド

# ── EC2 操作（AWS CLI） ──
aws ec2 start-instances --region ap-northeast-1 --instance-ids i-0789466d74768eaf9   # 開機
aws ec2 stop-instances --region ap-northeast-1 --instance-ids i-0789466d74768eaf9    # 関機
aws ec2 reboot-instances --region ap-northeast-1 --instance-ids i-0789466d74768eaf9  # 再起動
aws ec2 terminate-instances --region ap-northeast-1 --instance-ids i-0789466d74768eaf9 # 削除

# ── EC2 SSH ──
ssh -i ~/.ssh/rag-deploy-key.pem ec2-user@35.74.76.156
# EC2 上で: cd ~/rag-deploy && docker compose --profile prod ps

# ── デプロイ ──
git push fg main      # → EC2 へ自動デプロイ
git push origin main   # → Orange Pi へ自動デプロイ
```

## データ永続化

| Volume | マウント先 | 内容 |
|--------|----------|------|
| `pgdata` | /var/lib/postgresql/data | PostgreSQL（ベクトル、KV、ドキュメント、スライド） |
| `valkeydata` | /data | Valkey キャッシュ |
| `lightrag-data` | /app/data | NetworkX グラフファイル |
| `chat-files` | /app/data/chat-files | チャット添付ファイル（画像・PDF 等） |

## リソース使用量

7 コンテナ合計約 **550 MB**（アイドル時）:

| コンテナ | メモリ |
|---------|-------|
| lightrag | ~254 MB |
| rag-ui | ~109 MB |
| crm-service | ~40 MB |
| postgres | ~37 MB |
| task-worker | ~40 MB |
| opensandbox | ~50 MB |
| valkey | ~10 MB |

## ビルド時の注意

- **rag-ui Dockerfile**: `ARG GEMINI_API_KEY=enabled`（ダミー値）を build 時に渡す。`next.config.ts` の `NEXT_PUBLIC_LLM_BACKEND` は build 時に評価されるため、ダミー値で "Gemini" に確定させる。実際の API Key は runtime の `environment` で注入。
- **init.sql**: `CREATE EXTENSION vector` のみ。アプリケーションテーブル（ingest_jobs, lightrag_*, slide_decks, slide_pages, slide_page_versions, slide_templates, skills, chat_conversations, chat_messages, chat_files, proposal_templates, crm_deal_cache, proposal_history, proposal_sessions, scheduled_tasks, task_executions, task_notifications）は各サービス起動時に自動作成。
- **Embedding 768 次元**: Gemini gemini-embedding-001 は Matryoshka 対応でデフォルト 3072 → 768 に縮小。全新規デプロイのため互換性問題なし。

## task-worker AI ツール一覧

| ツール | 説明 | 使用条件 |
|--------|------|----------|
| `searchKnowledgeBase` | 内部ナレッジベース（RAG）検索。`kbSlug` 未指定時は KB 一覧を自動取得して AI が選択（auto-discovery） | 社内文書・マニュアル等の内部情報が必要な時 |
| `webSearch` | Tavily ウェブ検索 | 最新ニュース・株価・公開情報が必要な時（`TAVILY_API_KEY` 必須） |
| `readUrl` | URL のテキスト抽出 | webSearch で見つけた URL の詳細を読む時 |
| `google_search` | Gemini 組み込み Google Search grounding | `TAVILY_API_KEY` 未設定 かつ AI Studio 使用時に自動追加（implicit、フィルター不可） |
| `crmApi` | CRM サービス API 呼出（Salesforce/Kintone/分析/提案書） | 商談データ・CRM 操作が必要な時。SF と Kintone は混ぜない |
| `executeCode` | Python/JS コード実行（OpenSandbox） | 計算・データ処理・可視化・ファイル変換・ML 等 |
| `createFile` | テキストファイル保存（CSV, JSON, MD 等） | レポート・データエクスポート等、ユーザーがダウンロードする成果物 |
| `generateImage` | Gemini 画像生成（`gemini-3.1-flash-image-preview`、Vertex AI / AI Studio 両対応） | 画像・イラスト・図の生成が必要な時 |
| `sendEmail` | メール送信（Resend + Markdown テンプレート） | ユーザーが明示的にメール送信を指示した時のみ |
| `analyzeImage` | Gemini Vision で画像分析（OCR、チャート読取、オブジェクト識別） | 画像 URL または fileId を指定。視覚的コンテンツの理解が必要な時 |
| `readFile` | 以前の createFile/executeCode/generateImage 結果ファイルの読み取り | 前ステップの出力を確認・再利用する時 |
| `httpRequest` | 任意の外部 REST API 呼出（GET/POST/PUT/PATCH/DELETE） | 天気・為替・株価・Webhook 等、他ツールでカバーされない外部 API |
| `queryDatabase` | PostgreSQL READ ONLY SQL クエリ（10s タイムアウト） | データ集計・統計・フィルタリング・レポート作成 |
| `editFile` | 既存ファイルのテキスト編集（replace/append/prepend/insertAfter） | CSV に行追加、JSON 更新、テキスト修正等 |
| `listFiles` | 現在/過去の実行のファイル一覧取得 | ファイル探索、grepFiles 前の確認 |
| `grepFiles` | テキストファイル横断正規表現検索 | 複数ファイル内のキーワード検索 |
| `loadSkill` | DB のスキル一覧から指定スキルの全文を読み込む | スキルが有効化されている時に implicit 追加（フィルター不可）。タスクに関連するスキルがあれば自動で呼出す |

### sandbox-python イメージ

`opensandbox/Dockerfile.sandbox-python` で構築。executeCode から利用。

**CLI ツール**: ffmpeg, imagemagick, graphviz, gnuplot, pandoc, weasyprint, curl, wget, httpie, jq, xmlstarlet, csvkit, miller, ripgrep, sqlite3, yt-dlp, gallery-dl, git, zip, bc, tree

**Python パッケージ**: numpy, scipy, pandas, matplotlib, seaborn, plotly, scikit-learn, openpyxl, xlsxwriter, requests, beautifulsoup4, lxml, feedparser, yfinance, tabulate, Pillow, pydantic, python-docx, reportlab, sympy

### /output/ 自動アップロード

sandbox 内で `/output/` ディレクトリに保存されたファイルは、コード実行完了後に自動的に `sandbox.files.readBytes()` → multipart/form-data で `POST /api/task-files` にアップロードされる。base64 変換なし、バイナリ直送。動画・画像・PDF 等の大容量バイナリファイルに対応。アップロードされたファイルは実行結果詳細画面でダウンロード可能。

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
| task-worker が「メール送信機能がない」と回答 | email.ts は存在するが通知用のみ、AI ツールとして未公開 | `sendEmail` ツール追加（Resend API + AiEmail Markdown テンプレート）。description に Use when/Do not use when 明記 |
| task-worker の tool description が粗雑で AI が誤判断 | 各ツールに Use when/Do not use when がなく、AI がツール選択を間違える | 全 7 ツールの description を統一フォーマットで詳細化。executeCode に全 CLI/Python パッケージ列挙、crmApi に全エンドポイント列挙、SF/Kintone 混同禁止ルール追加 |
| task 完了後 `result.text` が `<ctrl46>` | Gemini が tool 完了後に正常テキストを返さず制御文字を出力 | executor.ts の system prompt に「最終サマリーを必ず出力せよ」を追加 |
| task-files アップロードが base64 JSON で非効率 | sandbox バイナリ → base64 → JSON → decode で 33% 膨胀＋メモリ圧迫 | multipart/form-data に変更。sandbox.ts, tools.ts, route.ts 全て FormData + Blob で直送 |
| `sandbox.files.write()` が TypeScript エラー | `@alibaba-group/opensandbox` SDK が `write()` → `writeFiles([{path, data}])` に API 変更 | `sandbox.files.writeFiles([{ path: filename, data: code }])` に変更 |
| `ReadableStream.from()` が TypeScript エラー | `readBytesStream()` は `AsyncIterable<Uint8Array>` を返すが TS の `ReadableStream` 型定義に `from()` 静的メソッドがない | `(ReadableStream as unknown as { from(i: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> }).from(stream)` でキャスト。Bun ランタイムでは動作する |
| `@react-email/markdown` の `markdownCustomStyles` でキー名エラー | `strong`/`code`/`blockquote` は無効。正しいキーは `bold`/`codeInline`/`blockQuote` | `StylesType` の定義に合わせてキー名を修正 |
| task-worker の `getImageModel()` が Vertex AI で無効化されていた | Vertex AI は `imageModel()` メソッド、AI Studio は `image()` メソッドと異なる点を誤解していた | 両プロバイダーとも `image("gemini-3.1-flash-image-preview")` で統一（`@ai-sdk/google-vertex@4.0.95` の `GoogleVertexImageModelId` にも gemini 系モデルが含まれる）|
| /scheduler/1 詳細画面が重い | 887 行の単一コンポーネントに全 state。dialog 開閉・15s ポーリングで全体再レンダリング | Zustand store で dialog 状態分離 + 5 つの memo'd サブコンポーネントに分割 + executions の useQuery を ExecutionList 内に移動 |
| 実行結果の詳細 Dialog を閉じる時に白い帯が一瞬表示 | `setViewingExec(null)` で内容が先に消え、Dialog の閉じアニメーションだけ残る | `resultOpen` と `viewingExec` を分離。閉じる時は `resultOpen=false` のみ、データは保持して内容ごとアニメーション |
| 実行履歴リストで長文テキストがコンテナからはみ出す | flex 一行レイアウト + truncate で収まらない長文 | 二行レイアウトに変更（上: メタ情報、下: preview `line-clamp-3 break-words`） |
| PDF エクスポートでテキスト消失 | PDF export が innerHTML コピー時に computed styles を未コピー | `captureSlideAsPng()` で iframe 内直接キャプチャに変更（PPTX/PDF 共通） |
| PPTX がプレビューと異なる | innerHTML を外部 wrapper にコピー → Tailwind CSS が外部 DOM に不在 | iframe 内の body に直接 html2canvas 実行（same-origin srcdoc） |
| PDF 保存時に PPTX ボタンが回る | PDF/PPTX が `exporting` state を共有 | `exportingPdf` 独立 state 追加、各ボタンに専用 spinner |
| 提案書に受注率等の内部データ | `buildProposalContent` / `buildPptxPrompt` が内部スコアを含む | 顧客向けコンテンツから除外、PPTX prompt に禁止リスト明記 |
| 全案件で 3 サービス全推薦 | prompt にサービス選別ルールなし | 「関連サービスのみ推薦、無関係なら含めない」ルール追加 |
| セッション期限切れで提案書パネル無限 loading | `proposal-session.ts` がインメモリ Map + TTL 1h | PostgreSQL 永続化に変更。メモリキャッシュ + DB fallback |
| スライドのデザインがページごとにバラバラ | 各スライド独立並列生成、全体コンテキストなし | render prompt に「デッキ全体のデザイン統一ルール」追加 |
| styleOptions がスライド生成に反映されない | `renderSlides()` が styleOptions を受け取らず API に未送信 | `renderSlides()` に styleOptions パラメータ追加、render API body に含める |
| fetchAndAnalyze が crm-service 障害で全失敗 → ProposalPanel 開かず | `generateRationale()` が Gemini API エラーを catch せず throw → analyze endpoint が 500 返却 → fetchAndAnalyze が `{ error }` 返却 → detection effect が sessionKey を検出できず | 2 箇所修正: (1) `generateRationale()` に外側 try-catch 追加（Gemini 失敗時 fallback rationale 返却）(2) `fetchAndAnalyze` の analyze 呼出に try-catch 追加（失敗時もスコアリング結果なしで sessionKey 生成 → ProposalPanel は必ず開く） |
| task 生成ファイルが 60 分後に消える | `getOrphanFiles()` が `chat_messages` のみ参照チェック → `task_execution_files` で参照されたファイルも「孤立」と誤判定 → `cleanupOrphanFiles()` がディスク + DB から削除 | `getOrphanFiles()` に `task_execution_files` の EXISTS チェック追加。タスク実行で生成されたファイルは孤立判定から除外 |

## トラブルシューティング

| 問題 | 原因 | 対処 |
|------|------|------|
| lightrag unhealthy | Gemini API Key 無効 | `.env` の `GEMINI_API_KEY` を確認 |
| rag-ui が lightrag に接続失敗 | lightrag 未起動 | `docker compose logs lightrag` で確認 |
| PDF アップロード後 failed | Gemini API エラー（Rate limit 等） | `docker compose logs lightrag` で詳細確認 |
| 検索結果が空 | ドキュメント未入庫 or 入庫処理中 | `/api/documents` で status 確認 |
| Embedding 速率制限でスロー | Tier 1 でも LightRAG 並列処理で RPM 超過 | `rag.py` に Semaphore(4) + 0.25s interval 実装済み。上位 Tier なら `_embed_sem` と `_embed_interval` を調整可 |
