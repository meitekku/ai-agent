# rag-deploy — RAG 一体化 Docker 部署

Gemini-only の自己完結型 Docker Compose プロジェクト。rag-ui（Next.js フロントエンド）と lightrag-service（Python バックエンド）を PostgreSQL + Valkey と共にパッケージ化。GPU 不要、`GEMINI_API_KEY` のみで任意のマシンにデプロイ可能。

## アーキテクチャ

```
docker-compose.yml
├── rag-ui       (Next.js standalone, Bun)     → port 4002:3000
├── lightrag     (Python FastAPI, uv)          → port 8007 (internal)
├── postgres     (pgvector/pgvector:pg17)      → port 5432 (internal)
└── valkey       (valkey/valkey:8)             → port 6379 (internal)
```

外部公開ポートは **4002 のみ**。内部サービス（postgres/valkey/lightrag）はホストに公開しない。

## プロジェクト構造

```
rag-deploy/
├── docker-compose.yml              # 4サービス定義
├── .env.example                    # GEMINI_API_KEY テンプレート
├── .env                            # 実際の API Key（git 管理外）
├── init.sql                        # CREATE EXTENSION vector
├── .gitignore                      # .env, node_modules, .venv 等
├── lightrag-service/               # Python FastAPI バックエンド
│   ├── Dockerfile                  # python:3.12-slim + uv
│   ├── .dockerignore
│   ├── pyproject.toml              # 依存（pymupdf 追加済み）
│   ├── uv.lock
│   └── app/
│       ├── config.py               # 環境変数設定
│       ├── main.py                 # FastAPI エントリ + lifespan
│       ├── rag.py                  # LightRAG シングルトン + Gemini embedding 速率制限
│       ├── ocr.py                  # OCR（Gemini Vision / GLM-OCR）
│       ├── db.py                   # asyncpg + ingest_jobs テーブル
│       └── routers/
│           ├── ingest.py           # POST /ingest（asyncio.Queue 排隊処理）
│           ├── query.py            # POST /query + /query/search-only
│           ├── documents.py        # GET/DELETE /documents
│           └── doc_status.py       # GET /ingest/status/{track_id}
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
| `lightrag-service/app/rag.py` | 同上 | 一致 | Gemini embedding 速率制限追加 |
| `lightrag-service/app/routers/ingest.py` | 同上 | 一致 | asyncio.Queue 排隊処理 |
| `lightrag-service/pyproject.toml` | 同上 | **意図的に不一致** | deploy 版のみ `pymupdf` 追加（Gemini OCR 用） |
| `rag-ui/app/api/chat/route.ts` | `~/Desktop/uiForAI/rag-ui/` | 一致 | webSearch + readPage tools（リトライ付き）+ skills injection |
| `rag-ui/app/layout.tsx` | 同上 | 一致 | AppShell ラッパー追加 |
| `rag-ui/app/page.tsx` | 同上 | 一致 | / → /new リダイレクト |
| `rag-ui/app/new/page.tsx` | 同上 | 一致 | 新規チャットページ |
| `rag-ui/app/documents/page.tsx` | 同上 | 一致 | ドキュメント管理ルート |
| `rag-ui/app/skills/page.tsx` | 同上 | 一致 | スキル管理ルート |
| `rag-ui/app/api/skills/route.ts` | 同上 | 一致 | GET/POST skills API |
| `rag-ui/app/api/skills/[id]/route.ts` | 同上 | 一致 | PUT/DELETE skills API |
| `rag-ui/components/app-shell.tsx` | 同上 | 一致 | sidebar + header ラッパー |
| `rag-ui/components/app-sidebar.tsx` | 同上 | 一致 | ナビゲーションサイドバー（usePathname） |
| `rag-ui/components/chat-header.tsx` | 同上 | 一致 | usePathname でタイトル切替 |
| `rag-ui/components/documents-page.tsx` | 同上 | 一致 | ドキュメント管理ページ |
| `rag-ui/components/skills-page.tsx` | 同上 | 一致 | スキル CRUD ページ |
| `rag-ui/components/chat-message.tsx` | 同上 | 一致 | webSearch + readPage ToolCallIndicator 追加 |
| `rag-ui/lib/store.ts` | 同上 | 一致 | sidebar state（Zustand） |
| `rag-ui/lib/skills-db.ts` | 同上 | 一致 | Skills PostgreSQL CRUD |
| `rag-ui/lib/constants.ts` | 同上 | 一致 | TAVILY_API_KEY 追加 |
| `rag-ui/` その他全ファイル | 同上 | 一致 | 変更なし |

### 同期コマンド

```bash
# rag-ui の変更を rag-deploy に反映
# ページ・レイアウト
cp ~/Desktop/uiForAI/rag-ui/app/layout.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/app/layout.tsx
cp ~/Desktop/uiForAI/rag-ui/app/page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/app/page.tsx
cp ~/Desktop/uiForAI/rag-ui/app/new/page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/app/new/page.tsx
cp ~/Desktop/uiForAI/rag-ui/app/documents/page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/app/documents/page.tsx
cp ~/Desktop/uiForAI/rag-ui/app/skills/page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/app/skills/page.tsx
# API
cp ~/Desktop/uiForAI/rag-ui/app/api/chat/route.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/app/api/chat/route.ts
cp -r ~/Desktop/uiForAI/rag-ui/app/api/skills ~/Desktop/uiForAI/rag-deploy/rag-ui/app/api/skills
# コンポーネント
cp ~/Desktop/uiForAI/rag-ui/components/app-shell.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/app-shell.tsx
cp ~/Desktop/uiForAI/rag-ui/components/app-sidebar.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/app-sidebar.tsx
cp ~/Desktop/uiForAI/rag-ui/components/chat-header.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/chat-header.tsx
cp ~/Desktop/uiForAI/rag-ui/components/chat-message.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/chat-message.tsx
cp ~/Desktop/uiForAI/rag-ui/components/documents-page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/documents-page.tsx
cp ~/Desktop/uiForAI/rag-ui/components/skills-page.tsx ~/Desktop/uiForAI/rag-deploy/rag-ui/components/skills-page.tsx
# ライブラリ
cp ~/Desktop/uiForAI/rag-ui/lib/store.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/store.ts
cp ~/Desktop/uiForAI/rag-ui/lib/skills-db.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/skills-db.ts
cp ~/Desktop/uiForAI/rag-ui/lib/constants.ts ~/Desktop/uiForAI/rag-deploy/rag-ui/lib/constants.ts

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
| rag-ui | `TAVILY_API_KEY` | ${TAVILY_API_KEY:-} | ウェブ検索（オプション） |
| rag-ui | `DATABASE_URL` | postgresql://raguser:ragpass@postgres:5432/lightrag | スライド履歴+スキル用 |

### .env（ユーザー設定）

| 変数 | 説明 |
|------|------|
| `GEMINI_API_KEY` | Gemini API Key（必須） |
| `TAVILY_API_KEY` | Tavily API Key（オプション、設定時→ウェブ検索ツール有効化） |

## コマンド

```bash
# ビルド
docker compose build

# 起動
docker compose up -d

# 状態確認
docker compose ps

# ログ確認
docker compose logs -f lightrag
docker compose logs -f rag-ui

# 停止
docker compose down

# データ含め完全削除
docker compose down -v

# 強制再ビルド
docker compose build --no-cache
```

## データ永続化

| Volume | マウント先 | 内容 |
|--------|----------|------|
| `pgdata` | /var/lib/postgresql/data | PostgreSQL（ベクトル、KV、ドキュメント、スライド） |
| `valkeydata` | /data | Valkey キャッシュ |
| `lightrag-data` | /app/data | NetworkX グラフファイル |

## リソース使用量

4 コンテナ合計約 **410 MB**（アイドル時）:

| コンテナ | メモリ |
|---------|-------|
| lightrag | ~254 MB |
| rag-ui | ~109 MB |
| postgres | ~37 MB |
| valkey | ~10 MB |

## ビルド時の注意

- **rag-ui Dockerfile**: `ARG GEMINI_API_KEY=enabled`（ダミー値）を build 時に渡す。`next.config.ts` の `NEXT_PUBLIC_LLM_BACKEND` は build 時に評価されるため、ダミー値で "Gemini" に確定させる。実際の API Key は runtime の `environment` で注入。
- **init.sql**: `CREATE EXTENSION vector` のみ。アプリケーションテーブル（ingest_jobs, lightrag_*, slide_*, skills）は各サービス起動時に自動作成。
- **Embedding 768 次元**: Gemini gemini-embedding-001 は Matryoshka 対応でデフォルト 3072 → 768 に縮小。全新規デプロイのため互換性問題なし。

## 踩坑記録

| 問題 | 原因 | 対処 |
|------|------|------|
| `text-embedding-004 is not found` | Google が v1beta API から廃止 | `gemini-embedding-001` に変更 |
| Embedding 429 RESOURCE_EXHAUSTED | 免費層 100 req/min 制限、LightRAG が entity/relation ごとに embedding 呼出 | `rag.py` に速率制限（Semaphore + interval）追加。付費層なら制限緩和可 |
| 複数ファイル同時アップロードで誤った processed 状態 | LightRAG の `apipeline_process_enqueue_documents` 内部 busy フラグで後続呼出が即 return | `ingest.py` を asyncio.Queue + 単一 worker に改修 |
| ブラウザでファイル選択後リクエストが発生しない | `FileList` は活参照、`input.value=""` で空になる。`Array.from()` 前に clear していた | `Array.from()` でコピー後に clear するよう修正 |
| `NEXT_PUBLIC_LLM_BACKEND=MLX` | build 時に GEMINI_API_KEY 未設定 | `docker compose build --no-cache` で再ビルド |

## トラブルシューティング

| 問題 | 原因 | 対処 |
|------|------|------|
| lightrag unhealthy | Gemini API Key 無効 | `.env` の `GEMINI_API_KEY` を確認 |
| rag-ui が lightrag に接続失敗 | lightrag 未起動 | `docker compose logs lightrag` で確認 |
| PDF アップロード後 failed | Gemini API エラー（Rate limit 等） | `docker compose logs lightrag` で詳細確認 |
| 検索結果が空 | ドキュメント未入庫 or 入庫処理中 | `/api/documents` で status 確認 |
| Embedding 速率制限でスロー | 免費層 API Key | 付費層にアップグレード後、`rag.py` の速率制限を緩和 |
