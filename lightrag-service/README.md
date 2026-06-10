# LightRAG Service

[LightRAG](https://github.com/HKUDS/LightRAG) ベースのマルチナレッジベース文書問答サービス。PDF / CSV アップロード後、LLM が自動的にエンティティと関係を抽出し知識グラフを構築。クエリ時はグラフ構造で関連情報を検索。

## アーキテクチャ

```
POST /ingest?kb=<slug>（非同期）
  → Gemini Vision OCR（PDF → Markdown）/ CSV 構造化抽出
  → asyncio.Queue → 単一 worker で順次処理
  → LightRAG apipeline_enqueue_documents()
    └── 自動：分割 → LLM エンティティ/関係抽出 → 知識グラフ → embedding 入庫

POST /query/search-only?kb=<slug>
  → LightRAG aquery(mode="hybrid", only_need_context=True)
  → 知識グラフコンテキスト返却

POST /query?kb=<slug>
  → LightRAG aquery(mode="hybrid")
  → LLM 生成回答（SSE ストリーミング対応）
```

## API エンドポイント

全ドキュメント系エンドポイントは `?kb=<slug>` パラメータ必須（マルチ KB 対応）。

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/health` | ヘルスチェック |
| GET | `/kbs` | ナレッジベース一覧 |
| POST | `/kbs` | ナレッジベース作成 |
| GET | `/kbs/{slug}` | ナレッジベース詳細 |
| PUT | `/kbs/{slug}` | ナレッジベース更新 |
| DELETE | `/kbs/{slug}` | ナレッジベース削除 |
| POST | `/ingest?kb=` | ファイルアップロード（multipart form、非同期処理） |
| GET | `/ingest/status/{track_id}?kb=` | 入庫ステータス確認 |
| GET | `/documents?kb=` | ドキュメント一覧（status 付き） |
| DELETE | `/documents/{doc_id}?kb=` | ドキュメント削除（知識グラフ完全クリーンアップ） |
| POST | `/query/search-only?kb=` | 知識グラフ検索のみ（LLM 生成なし） |
| POST | `/query?kb=` | 検索 + LLM 回答生成（SSE ストリーミング対応） |

## プロジェクト構造

```
lightrag-service/
├── Dockerfile            # python:3.12-slim + uv
├── .dockerignore
├── pyproject.toml        # 依存（lightrag-hku, fastapi, pymupdf 等）
├── uv.lock               # ロックファイル
└── app/
    ├── config.py          # 環境変数設定
    ├── main.py            # FastAPI エントリ + lifespan（stale job recovery 含む）
    ├── rag.py             # LightRAG LRU マルチインスタンス（workspace=kb_slug で KB 分離）
    ├── extract.py         # マルチフォーマットテキスト抽出（CSV 構造化対応）
    ├── ocr.py             # OCR パイプライン（Gemini Vision async）
    ├── db.py              # asyncpg 接続プール + knowledge_bases / ingest_jobs テーブル
    └── routers/
        ├── kbs.py         # ナレッジベース CRUD
        ├── ingest.py      # ファイル入庫（asyncio.Queue 排隊処理）
        ├── query.py       # 検索 + 問答
        ├── documents.py   # ドキュメント管理
        └── doc_status.py  # 入庫ステータス
```

## 環境変数

Docker Compose で設定済み（`docker-compose.yml` 参照）。

| 変数 | デフォルト | 説明 |
|------|----------|------|
| `LLM_PROVIDER` | gemini | LLM バックエンド（`local` / `mlx` / `gemini`） |
| `GEMINI_API_KEY` | AI Studio 時 | Gemini API Key（Vertex AI 使用時は不要） |
| `GEMINI_MODEL` | gemini-3.5-flash | Gemini チャット/生成 LLM モデル |
| `GEMINI_OCR_MODEL` | gemini-2.5-flash | OCR / ドキュメント抽出用モデル（GA・当面維持） |
| `GEMINI_IMAGE_MODEL` | gemini-3.1-flash-image | 画像生成モデル |
| `GEMINI_ALLOWED_MODELS` | — | 許可モデル（カンマ区切り。空なら未制限） |
| `USE_VERTEX_AI` | `false` | `true` で Vertex AI 経由に切替（GCP credit 使用可） |
| `GCP_PROJECT_ID` | — | GCP プロジェクト ID（Vertex AI 時必須） |
| `GCP_LOCATION` | `global` | GCP リージョン（Gemini 3.x は `global` のみ） |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Service Account JSON パス（Vertex AI 時必須） |
| `EMBEDDING_PROVIDER` | gemini | Embedding バックエンド（`local` / `gemini`） |
| `GEMINI_EMBEDDING_MODEL` | gemini-embedding-001 | Gemini Embedding モデル |
| `EMBEDDING_DIM` | 768 | Embedding 次元数（Matryoshka 縮小） |
| `OCR_PROVIDER` | gemini | OCR バックエンド（`local` / `gemini`） |
| `PG_HOST` | postgres | PostgreSQL ホスト |
| `PG_PORT` | 5432 | PostgreSQL ポート |
| `PG_USER` | raguser | PostgreSQL ユーザー |
| `PG_PASSWORD` | ragpass | PostgreSQL パスワード |
| `PG_DATABASE` | lightrag | PostgreSQL データベース |

## LightRAG 設定

- **ストレージ**: PGKVStorage + PGVectorStorage + NetworkXStorage（グラフ）+ PGDocStatusStorage
- **マルチ KB**: `workspace=kb_slug` で KB ごとに LightRAG インスタンスを LRU 管理
- **検索モード**: hybrid（低レベル実体検索 + 高レベルコミュニティ検索）
- **言語**: Japanese（エンティティ/関係/要約/キーワード抽出）
- **並行数**: `llm_model_max_async=4`
- **タイムアウト**: 120s
- **Embedding 速率制限**: `Semaphore(4)` + `0.25s` interval（Gemini RPM 制限対策）

## ソース版からの変更点

オリジナル `~/Desktop/ai/rag-system/lightrag-service/` からの変更：

| ファイル | 変更内容 |
|---------|---------|
| `pyproject.toml` | `pymupdf` 追加（Gemini Vision OCR 用） |
| `config.py` | PG デフォルト値を Docker 用に変更（`raguser/ragpass`） |
| `rag.py` | Gemini embedding 速率制限（Semaphore + interval）、`workspace=kb_slug`、Vertex AI デュアルモード（カスタム `_vertex_gemini_complete`） |
| `extract.py` | CSV 構造化抽出（エンコード自動検出 + グループ化レコード分割） |
| `ocr.py` | Gemini OCR async 化（`await client.aio.models.generate_content`） |
| `main.py` | stale job recovery 改善（全非終端ステータス対応） |
| `db.py` | `get_stale_jobs()` 追加 |

## ライセンス

MIT
