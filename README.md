# rag-deploy

RAG（Retrieval-Augmented Generation）ナレッジベースチャットシステムの Docker 一体化デプロイ。PDF をアップロードして知識グラフを構築し、ドキュメントと対話できます。Gemini API のみで動作し、GPU は不要です。

## 機能

- **ナレッジベースチャット** — PDF アップロード → 知識グラフ自動構築 → AI 回答生成
- **ドキュメント管理** — アップロード / 一覧 / 削除（OCR 対応）
- **スライド生成** — チャット回答から 4 種類のスライドを自動生成（HTML / Visual / Studio / Simple）
- **CRM 連携 + 提案書** — Salesforce / Kintone / 手動入力から商談データ取得 → KB 全検索 + Web 検索 → AI 商機分析 → テンプレート確認 → スタイル設定 → スライド提案書生成（チャット Tool Calling + ProposalPanel）
- **Generative UI（Widget）** — AI がインタラクティブな HTML ウィジェット（チャート、計算機、フォーム等）を生成してチャット内で表示
- **ウェブ検索** — Tavily 連携でリアルタイムウェブ検索（Tool Calling、オプション）
- **画像生成** — Gemini ネイティブ画像生成 + テキストモデルからの generateImage ツール
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
                    │    ├──▶ crm-service (Hono)        │
                    │    │      └──▶ postgres           │
                    │    │      └──▶ Gemini API         │
                    │    └──▶ valkey (cache)            │
                    │                                   │
                    └──────────────────────────────────┘
```

| サービス | イメージ | 役割 |
|---------|---------|------|
| **rag-ui** | `oven/bun:1` | Next.js 16 フロントエンド + API Routes |
| **crm-service** | `oven/bun:1` | CRM 連携 + 商機分析 + 提案書 PPTX 生成 |
| **lightrag** | `python:3.12-slim` | FastAPI バックエンド、PDF 入庫、知識グラフ検索 |
| **postgres** | `pgvector/pgvector:pg18` | ベクトル DB + メタデータ保存 |
| **valkey** | `valkey/valkey:8` | クエリキャッシュ |

## クイックスタート

### 前提条件

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2
- [Gemini API Key](https://aistudio.google.com/apikey) または GCP Service Account（Vertex AI）

### 1. クローンと設定

```bash
git clone https://github.com/YOUR_USERNAME/rag-deploy.git
cd rag-deploy
cp .env.example .env
```

`.env` を編集（2 つの方式から選択）：

**方式 A: AI Studio（簡単、API Key のみ）**
```
GEMINI_API_KEY=AIzaSy...your-key-here
```

**方式 B: Vertex AI（GCP Free Trial credit ¥46,955 使用可）**
```
USE_VERTEX_AI=true
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=global
GCP_SA_KEY_FILE=./your-service-account.json
```

> **注意**: GCP Free Trial の $300 credit は AI Studio には使えませんが、Vertex AI には使えます。

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

### Gemini API 認証（どちらか一方）

| 変数 | 説明 |
|------|------|
| `GEMINI_API_KEY` | AI Studio 方式: API Key（[こちらで取得](https://aistudio.google.com/apikey)） |
| `USE_VERTEX_AI` | Vertex AI 方式: `true` で有効化（GCP credit 使用可） |
| `GCP_PROJECT_ID` | Vertex AI 用 GCP プロジェクト ID |
| `GCP_LOCATION` | Vertex AI 用リージョン（デフォルト `global`、Gemini 3.x は `global` のみ） |
| `GCP_SA_KEY_FILE` | Service Account JSON ファイルパス |

### オプション

| 変数 | 説明 |
|------|------|
| `TAVILY_API_KEY` | [Tavily](https://tavily.com/) API Key（設定するとウェブ検索 Tool Calling が有効化。Vertex AI 使用時は必須） |
| `SALESFORCE_INSTANCE_URL` | Salesforce インスタンス URL（CRM 連携用） |
| `SALESFORCE_CLIENT_ID` | Salesforce OAuth2 クライアント ID |
| `SALESFORCE_CLIENT_SECRET` | Salesforce OAuth2 クライアントシークレット |
| `KINTONE_SUBDOMAIN` | Kintone サブドメイン（CRM 連携用） |
| `KINTONE_API_TOKEN` | Kintone API トークン |
| `KINTONE_APP_ID` | Kintone アプリ ID |

> **CRM 連携について**: Salesforce / Kintone の環境変数は全てオプションです。未設定でも Kintone モックデータで動作確認が可能です。チャットで「Kintoneの商談一覧を見せて」と入力するか、手動で会社情報を入力して商談分析・提案書生成ができます。

その他の設定（DB 認証情報、モデル名、サービス URL 等）は `docker-compose.yml` で設定済みです。

## Gemini API 使用量

| 機能 | モデル | タイミング |
|------|--------|----------|
| チャット回答 | gemini-3-flash-preview（ユーザー選択可） | クエリごと（キャッシュミス時） |
| PDF OCR | gemini-2.5-flash (Vision) | アップロード時（ページ数分） |
| 実体抽出 | gemini-2.5-flash | アップロード時（チャンク数分） |
| Embedding | gemini-embedding-001 | アップロード時 + クエリ時 |
| スライド生成 | gemini-3-flash-preview（チャットモデルに連動） | スライド作成時 |
| 商機分析根拠 | gemini-3-flash-preview（チャットモデルに連動） | 商談分析時 |
| 提案書スライド | gemini-3-flash-preview（チャットモデルに連動） | 提案書生成時（plan 生成 + 各ページ並行レンダリング） |
| Widget 生成 | gemini-3-flash-preview（チャットモデルに連動） | show-widget コードフェンス出力時 |
| 画像生成 | gemini-2.0-flash-exp | ユーザー依頼時 |

> **注意**: Gemini API の無料枠にはレート制限があります（特に Embedding: 100 req/min）。大きな PDF のアップロード時はスロットリングされる場合があります。速率制限機能が組み込まれているため処理は継続しますが、入庫速度は遅くなります。

> **コスト最適化**: Vertex AI モード（`USE_VERTEX_AI=true`）を使用すると、GCP Free Trial の $300 credit から差し引かれます。AI Studio の API Key 課金は GCP credit 対象外のためご注意ください。

## コマンド

```bash
# 状態確認
docker compose --profile prod ps

# ログ表示（全サービス）
docker compose --profile prod logs -f

# 特定サービスのログ
docker compose --profile prod logs -f lightrag
docker compose --profile prod logs -f rag-ui
docker compose --profile prod logs -f crm-service

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
| `pgdata` | PostgreSQL — ベクトル、知識グラフ KV ストア、ドキュメントメタ、チャット履歴、スライド、CRM キャッシュ |
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

**CRM サービス (crm-service)**
- Bun + Hono
- jsforce（Salesforce 連携）、xlsx（Excel パース）
- pptxgenjs（PPTX 提案書生成）
- Gemini API（商機分析根拠 + スライド計画 + スライド修正、maxTokens 16000 + 切断 JSON 自動修復）

**インフラ**
- PostgreSQL 17 + pgvector
- Valkey 8（Redis 互換キャッシュ）

## リソース使用量

5 コンテナ合計 約 450 MB（アイドル時）：

| コンテナ | メモリ |
|---------|-------|
| lightrag | ~254 MB |
| rag-ui | ~109 MB |
| crm-service | ~40 MB |
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
