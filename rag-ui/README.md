# rag-ui — RAG チャットフロントエンド

Next.js ベースの RAG チャットインターフェース。ナレッジベースチャット、CRM 商機分析、提案書生成、Generative UI Widget、画像生成を統合。

## 主な機能

- **マルチ KB チャット** — KB 選択 → LightRAG ハイブリッド検索 + Gemini ストリーミング生成（語義キャッシュ時 ~14ms）
- **ドキュメント管理** — PDF / CSV アップロード → OCR → 知識グラフ入庫（マルチ KB 対応）
- **CRM 連携 + 提案書** — Salesforce / Kintone / 手動入力 → 商機分析 → テンプレート確認 → スライド提案書生成
- **スライド生成** — チャット回答から 4 種類のスライド自動生成 + PPTX / PDF エクスポート + バージョン管理
- **Generative UI（Widget）** — AI がインタラクティブ HTML ウィジェットを生成し sandbox iframe で表示
- **画像生成** — Gemini ネイティブ画像生成 + テキストモデルからの generateImage ツール
- **ウェブ検索** — Tavily or Gemini Google Search grounding（Tool Calling、オプション）
- **チャット履歴・ブランチ** — 会話永続化、メッセージ編集、ブランチ分岐・切替
- **スキルシステム** — ドメイン知識をシステムプロンプトに注入（CRUD + ZIP + skills.sh レジストリ）

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- **UI**: shadcn/ui + AI Elements
- **AI**: Vercel AI SDK v6 (`ToolLoopAgent`, `generateObject`, `useChat`)
- **LLM**: Gemini API（gemini-3.5-flash、チャット別にユーザー変更可）
- **検索**: LightRAG（知識グラフ + ベクトル検索）
- **キャッシュ**: Valkey（Redis 互換、セマンティックキャッシュ）
- **DB**: PostgreSQL（チャット履歴、スライド、スキル、UI 設定）
- **ランタイム**: Bun

## セットアップ

rag-deploy の Docker Compose で自動起動されるため、単体セットアップは不要。

```bash
# rag-deploy からのビルド・起動
cd ../
docker compose --profile prod build
docker compose --profile prod up -d
```

## 環境変数

Docker Compose で設定済み（`docker-compose.yml` 参照）。

| 変数 | デフォルト | 説明 |
|------|----------|------|
| `GEMINI_API_KEY` | AI Studio 時 | Gemini API Key（Vertex AI 使用時は不要） |
| `GEMINI_MODEL` | `gemini-3.5-flash` | デフォルト LLM モデル（チャット別変更可） |
| `USE_VERTEX_AI` | `false` | `true` で Vertex AI 経由に切替（GCP credit 使用可） |
| `GCP_PROJECT_ID` | — | GCP プロジェクト ID（Vertex AI 時必須） |
| `GCP_LOCATION` | `global` | GCP リージョン（Gemini 3.x は `global` のみ） |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Service Account JSON パス（Vertex AI 時必須） |
| `LIGHTRAG_URL` | `http://lightrag:8007` | LightRAG サービス |
| `CRM_SERVICE_URL` | `http://crm-service:8009` | CRM サービス（設定時→CRM ツール有効） |
| `REDIS_URL` | `redis://valkey:6379` | Valkey キャッシュ |
| `DATABASE_URL` | `postgresql://raguser:ragpass@postgres:5432/lightrag` | PostgreSQL |
| `EMBEDDING_PROVIDER` | `gemini` | 語義キャッシュ用 Embedding |
| `TAVILY_API_KEY` | (オプション) | Tavily ウェブ検索（未設定→Gemini grounding） |

## アーキテクチャ

```
ブラウザ (useChat)
  → /api/chat (ToolLoopAgent)
    → Valkey キャッシュ確認
    → searchKnowledgeBase（LightRAG hybrid 検索）
    → webSearch / google_search（ウェブ検索）
    → fetchAndAnalyze（CRM 分析）
    → reviseSlides（スライド精准編集）
    → generateImage（画像生成）
    → Gemini ストリーミング生成
    → Valkey キャッシュ保存
```

## 依存サービス

全て Docker Compose 内で管理。

| サービス | ポート（内部） | 用途 |
|---------|--------------|------|
| lightrag | 8007 | 知識グラフ検索 + ドキュメント入庫 |
| crm-service | 8009 | CRM 連携 + 商機分析 + 提案書 PPTX |
| postgres | 5432 | pgvector + チャット履歴 + スライド + スキル |
| valkey | 6379 | クエリキャッシュ |
| Gemini API | — | LLM 推論 + Embedding + OCR + 画像生成 |

## PostgreSQL テーブル（自動作成）

| テーブル | 用途 |
|---------|------|
| `chat_conversations` | チャット会話 |
| `chat_messages` | メッセージツリー（ブランチ対応） |
| `chat_files` | アップロードファイルメタデータ |
| `slide_decks` | スライドデッキ（バージョン管理対応） |
| `slide_pages` | 個別スライド（最新版） |
| `slide_page_versions` | スライドバージョン履歴 |
| `slide_templates` | スライドテンプレート |
| `skills` | スキル（システムプロンプト注入用） |
| `ui_config` | UI 設定（サイドバー状態等） |

## ライセンス

MIT
