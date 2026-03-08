# LightRAG Service

[LightRAG](https://github.com/HKUDS/LightRAG) ベースの知識グラフ文書問答サービス。PDF アップロード後、LLM が自動的にエンティティと関係を抽出し知識グラフを構築。クエリ時はグラフ構造で関連情報を検索。

## アーキテクチャ

```
POST /ingest（非同期）
  → Gemini Vision OCR（PDF → Markdown）
  → LightRAG apipeline_enqueue_documents()（即座返却）
  → バックグラウンド: apipeline_process_enqueue_documents()
    └── 自動：分割 → LLM エンティティ/関係抽出 → 知識グラフ → embedding 入庫

POST /query/search-only
  → LightRAG aquery(mode="hybrid", only_need_context=True)
  → 知識グラフコンテキスト返却

POST /query
  → LightRAG aquery(mode="hybrid")
  → LLM 生成回答（SSE ストリーミング対応）
```

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/health` | ヘルスチェック |
| POST | `/ingest` | PDF アップロード（multipart form、非同期処理） |
| GET | `/ingest/status/{track_id}` | 入庫ステータス確認 |
| GET | `/documents` | ドキュメント一覧（status 付き） |
| DELETE | `/documents/{doc_id}` | ドキュメント削除（知識グラフ完全クリーンアップ） |
| POST | `/query/search-only` | 知識グラフ検索のみ（LLM 生成なし） |
| POST | `/query` | 検索 + LLM 回答生成（SSE ストリーミング対応） |

## プロジェクト構造

```
lightrag-service/
├── Dockerfile            # python:3.12-slim + uv
├── .dockerignore
├── pyproject.toml        # 依存（lightrag-hku, fastapi, pymupdf 等）
├── uv.lock               # ロックファイル
└── app/
    ├── config.py          # 環境変数設定
    ├── main.py            # FastAPI エントリ + lifespan 初期化
    ├── rag.py             # LightRAG シングルトン（LLM/Embedding プロバイダー切替）
    ├── ocr.py             # OCR パイプライン（Gemini Vision / GLM-OCR）
    ├── db.py              # asyncpg 接続プール + ingest_jobs テーブル
    └── routers/
        ├── ingest.py      # PDF 入庫（非同期バックグラウンドタスク）
        ├── query.py       # 検索 + 問答
        ├── documents.py   # ドキュメント管理
        └── doc_status.py  # 入庫ステータス
```

## 環境変数

Docker Compose で設定済み（`docker-compose.yml` 参照）。

| 変数 | デフォルト | 説明 |
|------|----------|------|
| `LLM_PROVIDER` | local | LLM バックエンド（`local` / `mlx` / `gemini`） |
| `GEMINI_API_KEY` | (空) | Gemini API Key |
| `GEMINI_MODEL` | gemini-2.5-flash | Gemini LLM モデル |
| `EMBEDDING_PROVIDER` | local | Embedding バックエンド（`local` / `gemini`） |
| `GEMINI_EMBEDDING_MODEL` | text-embedding-004 | Gemini Embedding モデル |
| `EMBEDDING_DIM` | 4096 | Embedding 次元数 |
| `OCR_PROVIDER` | local | OCR バックエンド（`local` / `gemini`） |
| `PG_HOST` | localhost | PostgreSQL ホスト |
| `PG_PORT` | 5432 | PostgreSQL ポート |
| `PG_USER` | raguser | PostgreSQL ユーザー |
| `PG_PASSWORD` | ragpass | PostgreSQL パスワード |
| `PG_DATABASE` | lightrag | PostgreSQL データベース |

## LightRAG 設定

- **ストレージ**: PGKVStorage + PGVectorStorage + NetworkXStorage（グラフ）+ PGDocStatusStorage
- **検索モード**: hybrid（低レベル実体検索 + 高レベルコミュニティ検索）
- **言語**: Japanese（エンティティ/関係/要約/キーワード抽出）
- **並行数**: Gemini `llm_model_max_async=4`、ローカル `1`
- **タイムアウト**: Gemini 120s、ローカル 3600s

## rag-deploy からの変更点

オリジナル `~/Desktop/ai/rag-system/lightrag-service/` からの唯一の変更：

- `pyproject.toml`: `pymupdf` 追加（Gemini Vision OCR で PDF → 画像変換に必要）
- `app/` コード: **変更なし**
