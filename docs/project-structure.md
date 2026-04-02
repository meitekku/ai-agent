# プロジェクト構造

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
