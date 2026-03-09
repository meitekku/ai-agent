# rag-deploy

RAG ナレッジベースチャットシステムの Docker 一体化デプロイ。GPU 不要、Gemini API Key のみで動作。

## 機能

- **ナレッジベースチャット** — PDF アップロード → 知識グラフ構築 → AI 回答生成
- **ドキュメント管理** — アップロード / 一覧 / 削除
- **スライド生成** — チャット回答から 4 種類のスライドを自動生成（HTML / Visual / Studio / Simple）
- **語義キャッシュ** — 同一クエリの高速応答（~14ms）
- **Gemini 全面統合** — LLM / Embedding / OCR すべて Gemini API

## クイックスタート

### 前提条件

- Docker + Docker Compose
- Gemini API Key（[Google AI Studio](https://aistudio.google.com/apikey) で取得）

### 1. セットアップ

```bash
git clone <repository-url> rag-deploy
cd rag-deploy
cp .env.example .env
```

### 2. API Key 設定

`.env` を編集して Gemini API Key を入力：

```
GEMINI_API_KEY=AIza...your-key-here
```

### 3. 起動

```bash
docker compose build
docker compose up -d
```

### 4. アクセス

ブラウザで http://localhost:4002 を開く。

## アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│  Docker Compose                                 │
│                                                 │
│  ┌──────────┐    ┌──────────┐                   │
│  │  rag-ui  │───▶│ lightrag │                   │
│  │ :3000    │    │ :8007    │                   │
│  │ Next.js  │    │ FastAPI  │                   │
│  └────┬─────┘    └──┬───┬──┘                   │
│       │             │   │                       │
│  ┌────▼─────┐  ┌───▼┐ ┌▼────────┐             │
│  │  valkey  │  │ pg │ │ Gemini  │ (external)   │
│  │  :6379   │  │:5432│ │  API   │              │
│  └──────────┘  └────┘ └─────────┘              │
│                                                 │
│  外部公開: :4002 → rag-ui :3000                 │
└─────────────────────────────────────────────────┘
```

| サービス | イメージ | 用途 |
|---------|---------|------|
| **rag-ui** | oven/bun:1 (Next.js standalone) | フロントエンド + API Routes |
| **lightrag** | python:3.12-slim (FastAPI + uv) | PDF 入庫 + 知識グラフ検索 |
| **postgres** | pgvector/pgvector:pg17 | ベクトル DB + メタデータ |
| **valkey** | valkey/valkey:8 | クエリキャッシュ |

## 使い方

### PDF アップロード

1. サイドバーの「ドキュメント管理」を開く
2. PDF をアップロード
3. ステータスが `processed` になるまで待つ（Gemini Vision OCR → 知識グラフ構築）

### チャット

- アップロードした文書に関する質問を入力
- LightRAG が知識グラフから関連情報を検索し、Gemini が回答を生成
- 同じ質問は Valkey キャッシュから高速応答

### スライド生成

- チャット回答の下のドロップダウンメニューからスライドモードを選択
- 4 種類: HTML スライド / ビジュアルスライド / スライドスタジオ / 簡易スライド
- PPTX / PDF エクスポート対応

## 運用コマンド

```bash
# 状態確認
docker compose ps

# ログ（リアルタイム）
docker compose logs -f

# 特定サービスのログ
docker compose logs -f lightrag

# 再起動
docker compose restart

# 停止
docker compose down

# データ含め完全削除（全文書が消える）
docker compose down -v

# 再ビルド（コード変更後）
docker compose build --no-cache && docker compose up -d
```

## データ永続化

3 つの Docker Volume にデータが保存される：

| Volume | 内容 |
|--------|------|
| `pgdata` | PostgreSQL（ベクトル、KV ストア、ドキュメントメタ、スライド履歴） |
| `valkeydata` | クエリキャッシュ |
| `lightrag-data` | NetworkX グラフファイル |

`docker compose down` でデータは保持される。`docker compose down -v` で完全削除。

## 技術スタック

### フロントエンド (rag-ui)

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- shadcn/ui + AI Elements
- Vercel AI SDK v6 (streamText + useChat)
- Streamdown（Markdown レンダリング）

### バックエンド (lightrag-service)

- FastAPI (Python 3.12)
- LightRAG-HKU（知識グラフ RAG）
- pgvector（ベクトル検索）
- PyMuPDF（PDF → 画像変換、Gemini Vision OCR 用）

### Gemini API 使用量

| 機能 | モデル | タイミング |
|------|--------|----------|
| チャット回答 | gemini-2.5-flash | クエリごと（キャッシュミス時） |
| PDF OCR | gemini-2.5-flash (Vision) | アップロード時（ページ数分） |
| 実体抽出 | gemini-2.5-flash | アップロード時（チャンク数分） |
| Embedding | text-embedding-004 | アップロード時 + クエリ時 |
| スライド生成 | gemini-2.5-flash | スライド作成時 |

## ライセンス

Private
