# 環境変数

ユーザー設定: `.env` の `GEMINI_API_KEY`（AI Studio 使用時必須）+ `TAVILY_API_KEY`（オプション）+ Vertex AI 設定（オプション）

## docker-compose.yml で設定済み

| サービス    | 変数                                  | 値                                                  | 説明                                                                   |
| ----------- | ------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| lightrag    | `LLM_PROVIDER`                        | gemini                                              | LLM バックエンド                                                       |
| lightrag    | `EMBEDDING_PROVIDER`                  | gemini                                              | Embedding バックエンド                                                 |
| lightrag    | `OCR_PROVIDER`                        | gemini                                              | OCR バックエンド                                                       |
| lightrag    | `GEMINI_MODEL`                        | gemini-3.5-flash                                    | LLM モデル                                                             |
| lightrag    | `GEMINI_OCR_MODEL`                    | gemini-2.5-flash                                    | OCR / 抽出モデル                                                       |
| lightrag    | `GEMINI_EMBEDDING_MODEL`              | gemini-embedding-001                                | Embedding モデル                                                       |
| lightrag    | `EMBEDDING_DIM`                       | 768                                                 | Embedding 次元                                                         |
| lightrag    | `GEMINI_IMAGE_MODEL`                  | gemini-3.1-flash-image                              | 画像生成モデル                                                         |
| lightrag    | `PG_HOST/PORT/USER/PASSWORD/DATABASE` | postgres/${PG_USER}/${PG_PASSWORD}/lightrag         | DB 接続                                                                |
| rag-ui      | `LIGHTRAG_URL`                        | http://lightrag:8007                                | バックエンド URL                                                       |
| rag-ui      | `REDIS_URL`                           | redis://valkey:6379                                 | キャッシュ URL                                                         |
| rag-ui      | `EMBEDDING_PROVIDER`                  | gemini                                              | 語義キャッシュ用                                                       |
| rag-ui      | `TAVILY_API_KEY`                      | ${TAVILY_API_KEY:-}                                 | ウェブ検索（オプション、未設定→Gemini Google Search にフォールバック） |
| rag-ui      | `DATABASE_URL`                        | postgresql://${PG_USER}:${PG_PASSWORD}@postgres:5432/lightrag | スライド履歴+スキル用                                         |
| rag-ui      | `CRM_SERVICE_URL`                     | http://crm-service:8009                             | CRM サービス URL（設定時→CRM ツール有効）                              |
| crm-service | `GEMINI_API_KEY`                      | ${GEMINI_API_KEY}                                   | Gemini API（.env から共有）                                            |
| rag-ui      | `GEMINI_MODEL`                        | gemini-3.5-flash                                    | デフォルト LLM モデル（チャット別にユーザーが変更可）                  |
| crm-service | `GEMINI_MODEL`                        | gemini-3.5-flash                                    | Gemini モデル（チャットからリクエスト経由で上書き可）                  |
| crm-service | `DATABASE_URL`                        | postgresql://${PG_USER}:${PG_PASSWORD}@postgres:5432/lightrag | DB 接続                                                      |
| crm-service | `SALESFORCE_*`                        | ${SALESFORCE\_\*:-}                                 | Salesforce 認証（オプション）                                          |
| crm-service | `KINTONE_*`                           | ${KINTONE\_\*:-}                                    | Kintone 認証（オプション）                                             |
| rag-ui      | `TASK_WORKER_URL`                     | http://task-worker:8010                             | タスクワーカー URL（設定時→スケジューラツール有効）                    |
| task-worker | `GEMINI_API_KEY`                      | ${GEMINI_API_KEY}                                   | Gemini API（.env から共有）                                            |
| task-worker | `GEMINI_MODEL`                        | gemini-3.5-flash                                    | Gemini モデル                                                          |
| task-worker | `DATABASE_URL`                        | postgresql://${PG_USER}:${PG_PASSWORD}@postgres:5432/lightrag | DB 接続                                                      |
| task-worker | `REDIS_URL`                           | redis://valkey:6379                                 | Valkey キュー接続                                                      |
| task-worker | `LIGHTRAG_URL`                        | http://lightrag:8007                                | KB 検索用                                                              |
| task-worker | `CRM_SERVICE_URL`                     | http://crm-service:8009                             | CRM API 用                                                             |
| task-worker | `OPENSANDBOX_URL`                     | opensandbox:8080                                    | コード実行サンドボックス                                               |
| task-worker | `RESEND_API_KEY`                      | ${RESEND_API_KEY:-}                                 | メール通知（オプション）                                               |

## .env（ユーザー設定）

| 変数                       | 説明                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`           | Gemini API Key（AI Studio 使用時必須、Vertex AI 使用時は不要）                                                 |
| `TAVILY_API_KEY`           | Tavily API Key（オプション、設定時→Tavily ウェブ検索、未設定→Gemini Google Search grounding にフォールバック） |
| `USE_VERTEX_AI`            | `true` で Vertex AI 経由に切替（GCP Free Trial credit が使える）                                               |
| `GCP_PROJECT_ID`           | GCP プロジェクト ID（Vertex AI 使用時必須）                                                                    |
| `GCP_LOCATION`             | GCP リージョン（デフォルト `global`。Gemini 3.x preview は `global` のみ対応）                                 |
| `GCP_SA_KEY_FILE`          | Service Account JSON ファイルパス（Vertex AI 使用時必須、Docker volume mount 用）                              |
| `SALESFORCE_INSTANCE_URL`  | Salesforce インスタンス URL（オプション）                                                                      |
| `SALESFORCE_CLIENT_ID`     | Salesforce クライアント ID（オプション）                                                                       |
| `SALESFORCE_CLIENT_SECRET` | Salesforce クライアントシークレット（オプション）                                                              |
| `KINTONE_SUBDOMAIN`        | Kintone サブドメイン（オプション）                                                                             |
| `KINTONE_API_TOKEN`        | Kintone API トークン（オプション）                                                                             |
| `KINTONE_APP_ID`           | Kintone アプリ ID（オプション）                                                                                |
| `RESEND_API_KEY`           | Resend API Key（オプション、定時タスクのメール通知用）                                                         |
| `EMAIL_FROM`               | メール送信元（例: `FleGrowth AI エージェント <noreply@ai.agent.kakiage-kun.jp>`）                              |
| `APP_URL`                  | アプリ URL（例: `https://ai.agent.kakiage-kun.jp`）                                                            |
| `GEMINI_MODEL`             | チャット / デフォルト LLM モデル（既定 `gemini-3.5-flash`）                                                    |
| `GEMINI_OCR_MODEL`         | OCR / 抽出モデル（既定 `gemini-2.5-flash`）                                                                    |
| `GEMINI_EMBEDDING_MODEL`   | Embedding モデル（既定 `gemini-embedding-001`）                                                                |
| `EMBEDDING_DIM`            | Embedding 次元（既定 `768`、Matryoshka）                                                                       |
| `GEMINI_IMAGE_MODEL`       | 画像生成モデル（既定 `gemini-3.1-flash-image`、fallback `gemini-2.5-flash-image`）                            |
| `GEMINI_ALLOWED_MODELS`    | ユーザー選択可モデルの許可リスト（カンマ区切り、空=サービス既定）                                              |
| `PG_USER`                  | PostgreSQL ユーザー名（既定 `raguser`）                                                                        |
| `PG_PASSWORD`              | PostgreSQL パスワード（既定 `ragpass`）                                                                        |
| `APP_NAME`                 | アプリ名（ブランド配線用、値差替は後続 Phase）                                                                 |
| `APP_DESCRIPTION`          | アプリ説明（ブランド配線用）                                                                                   |
| `APP_LOGO_URL`             | ロゴ URL（ブランド配線用）                                                                                     |
| `EMAIL_BRAND`              | メールブランド名（ブランド配線用）                                                                            |
| `RAG_LANGUAGE`             | RAG 言語（既定 `en`、`ja` で日本語切替）                                                                       |
| `APP_LOCALE`               | アプリロケール（既定 `en`）                                                                                    |
| `APP_TIMEZONE`             | タイムゾーン（既定 `UTC`）                                                                                     |
