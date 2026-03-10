# rag-deploy

RAG（Retrieval-Augmented Generation）ナレッジベースチャットシステムの Docker 一体化デプロイ。PDF をアップロードして知識グラフを構築し、ドキュメントと対話できます。Gemini API のみで動作し、GPU は不要です。

## 機能

- **ナレッジベースチャット** — PDF アップロード → 知識グラフ自動構築 → AI 回答生成
- **ドキュメント管理** — アップロード / 一覧 / 削除（OCR 対応）
- **スライド生成** — チャット回答から 4 種類のスライドを自動生成（HTML / Visual / Studio / Simple）
- **ウェブ検索** — Tavily 連携でリアルタイムウェブ検索（Tool Calling、オプション）
- **語義キャッシュ** — 同一クエリは Valkey キャッシュから ~14ms で応答
- **チャット履歴・ブランチ** — 会話の永続化、メッセージ編集、ブランチ分岐・切替
- **スキルシステム** — ドメイン知識をシステムプロンプトに注入（CRUD + ZIP アップロード）

## アーキテクチャ

```
                    ┌──────────────────────────────────┐
                    │        Docker Compose             │
 :4002              │                                   │
────────────────────┤  rag-ui (Next.js)                 │
                    │    │                              │
                    │    ├──▶ lightrag (FastAPI)        │
                    │    │      └──▶ postgres (pgvector)│
                    │    │      └──▶ Gemini API ──────────── (外部)
                    │    └──▶ valkey (cache)            │
                    │                                   │
                    └──────────────────────────────────┘
```

| サービス | イメージ | 役割 |
|---------|---------|------|
| **rag-ui** | `oven/bun:1` | Next.js 16 フロントエンド + API Routes |
| **lightrag** | `python:3.12-slim` | FastAPI バックエンド、PDF 入庫、知識グラフ検索 |
| **postgres** | `pgvector/pgvector:pg17` | ベクトル DB + メタデータ保存 |
| **valkey** | `valkey/valkey:8` | クエリキャッシュ |

## クイックスタート

### 前提条件

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2
- [Gemini API Key](https://aistudio.google.com/apikey)（無料枠で動作可能）

### 1. クローンと設定

```bash
git clone https://github.com/YOUR_USERNAME/rag-deploy.git
cd rag-deploy
cp .env.example .env
```

`.env` を編集して Gemini API Key を入力：

```
GEMINI_API_KEY=AIzaSy...your-key-here
```

### 2. ビルドと起動

```bash
docker compose --profile prod build
docker compose --profile prod up -d
```

初回ビルドは数分かかります。2 回目以降はキャッシュが効きます。

### 3. アクセス

ブラウザで **http://localhost:4002** を開く。

### 4. ドキュメントをアップロードしてチャット

1. サイドバーの「ドキュメント」を開く
2. PDF をアップロード — 自動で OCR → 知識グラフ構築が始まる（ステータス: `processing` → `processed`）
3. 「新規チャット」でドキュメントに関する質問を入力

## 設定

### 必須

| 変数 | 説明 |
|------|------|
| `GEMINI_API_KEY` | Google Gemini API Key（[こちらで取得](https://aistudio.google.com/apikey)） |

### オプション

| 変数 | 説明 |
|------|------|
| `TAVILY_API_KEY` | [Tavily](https://tavily.com/) API Key（設定するとウェブ検索 Tool Calling が有効化） |

その他の設定（DB 認証情報、モデル名、サービス URL 等）は `docker-compose.yml` で設定済みです。

## Gemini API 使用量

| 機能 | モデル | タイミング |
|------|--------|----------|
| チャット回答 | gemini-2.5-flash | クエリごと（キャッシュミス時） |
| PDF OCR | gemini-2.5-flash (Vision) | アップロード時（ページ数分） |
| 実体抽出 | gemini-2.5-flash | アップロード時（チャンク数分） |
| Embedding | gemini-embedding-001 | アップロード時 + クエリ時 |
| スライド生成 | gemini-2.5-flash | スライド作成時 |

> **注意**: Gemini API の無料枠にはレート制限があります（特に Embedding: 100 req/min）。大きな PDF のアップロード時はスロットリングされる場合があります。速率制限機能が組み込まれているため処理は継続しますが、入庫速度は遅くなります。

## コマンド

```bash
# 状態確認
docker compose --profile prod ps

# ログ表示（全サービス）
docker compose --profile prod logs -f

# 特定サービスのログ
docker compose --profile prod logs -f lightrag
docker compose --profile prod logs -f rag-ui

# 再起動
docker compose --profile prod restart

# 停止（データは保持）
docker compose --profile prod down

# データ含め完全削除
docker compose --profile prod down -v

# コード変更後の再ビルド
docker compose --profile prod build --no-cache
docker compose --profile prod up -d
```

## データ永続化

3 つの Docker Volume にデータが保存され、`docker compose down` / `up` でも保持されます：

| Volume | 内容 |
|--------|------|
| `pgdata` | PostgreSQL — ベクトル、知識グラフ KV ストア、ドキュメントメタ、チャット履歴、スライド |
| `valkeydata` | クエリキャッシュ |
| `lightrag-data` | NetworkX グラフファイル |

完全にリセットするには `docker compose down -v` を実行してください。

## 技術スタック

**フロントエンド (rag-ui)**
- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- shadcn/ui, Vercel AI SDK v6, Streamdown

**バックエンド (lightrag-service)**
- FastAPI, Python 3.12, uv
- [LightRAG](https://github.com/HKUDS/LightRAG)（知識グラフ RAG）
- pgvector, PyMuPDF（PDF → Gemini Vision OCR）

**インフラ**
- PostgreSQL 17 + pgvector
- Valkey 8（Redis 互換キャッシュ）

## リソース使用量

4 コンテナ合計 約 410 MB（アイドル時）：

| コンテナ | メモリ |
|---------|-------|
| lightrag | ~254 MB |
| rag-ui | ~109 MB |
| postgres | ~37 MB |
| valkey | ~10 MB |

## トラブルシューティング

| 問題 | 原因 | 対処 |
|------|------|------|
| `lightrag` が unhealthy のまま | Gemini API Key が無効 | `.env` の `GEMINI_API_KEY` を確認 |
| PDF アップロード後 `failed` | Gemini API レート制限 | `docker compose logs lightrag` で確認、しばらく待って再試行 |
| 検索結果が空 | ドキュメントがまだ処理中 | ドキュメントページでステータスを確認 |
| PDF 入庫が遅い | 無料枠の Embedding レート制限 | 有料版にアップグレード、または速率制限の緩和を待つ |

## ライセンス

MIT
