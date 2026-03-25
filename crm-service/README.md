# crm-service

CRM 連携 + 提案書生成マイクロサービス。Salesforce / Kintone からの商談データ取得、AI 商機分析、PPTX 提案書生成を提供。

## 機能

- **Salesforce 連携** — OAuth2 認証、商談一覧・詳細取得（12 種 SF オブジェクト対応）
- **Kintone 連携** — API トークン認証、レコード一覧・詳細取得（未接続時モックデータで動作）
- **ファイルインポート** — XLSX / CSV / TXT から案件データ自動抽出
- **商機分析** — 受注確率、スコアリング、3 シナリオ、AI 根拠生成
- **提案書 PPTX** — AI スライド構成設計 → pptxgenjs レンダリング（plan / render / revise 分割対応）
- **テンプレート管理** — PostgreSQL BYTEA ストレージ、AI サービス名自動検出

## 技術スタック

- [Bun](https://bun.sh/) ランタイム
- [Hono](https://hono.dev/) Web フレームワーク
- [Gemini API](https://ai.google.dev/) AI 分析・生成
- [jsforce](https://jsforce.github.io/) Salesforce 接続
- [pptxgenjs](https://gitbrent.github.io/PptxGenJS/) PowerPoint 生成
- [xlsx](https://sheetjs.com/) Excel パース
- PostgreSQL（共用 DB）

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/health` | ヘルスチェック |
| POST | `/sf/check` | SF 利用可能オブジェクト一覧 |
| POST | `/sf/list` | SF 商談一覧 |
| POST | `/sf/fetch` | SF 商談詳細（12 種データ一括取得） |
| POST | `/kintone/list` | Kintone レコード一覧（未接続時モックフォールバック） |
| POST | `/kintone/fetch` | Kintone レコード詳細 → SFData 形式に正規化 |
| POST | `/deals/parse-file` | XLSX / CSV / TXT から案件データ抽出 |
| POST | `/deals/analyze` | 商機分析（スコアリング + AI 根拠生成） |
| POST | `/deals/revise-rationale` | フィードバックで分析根拠修正 |
| POST | `/deals/solution-qa` | マルチターン会話 Q&A |
| GET | `/templates` | 提案テンプレート一覧 |
| POST | `/templates` | テンプレートアップロード（FormData） |
| DELETE | `/templates` | テンプレート削除 |
| PATCH | `/templates` | サービス名更新 |
| POST | `/templates/detect` | AI サービス名自動検出 |
| POST | `/proposal/generate-plan` | AI スライド計画 JSON 生成 |
| POST | `/proposal/render-pptx` | PresentationPlan → PPTX 生成 |
| POST | `/proposal/revise-slide` | 1 スライドのみ AI 修正 |
| POST | `/proposal/generate-pptx` | 一括生成（レガシー） |

## 環境変数

Docker Compose で設定済み（`docker-compose.yml` 参照）。

| 変数 | 必須 | 説明 |
|------|------|------|
| `GEMINI_API_KEY` | AI Studio 時 | Gemini API Key（Vertex AI 使用時は不要） |
| `GEMINI_MODEL` | No | デフォルト `gemini-3-flash-preview` |
| `USE_VERTEX_AI` | No | `true` で Vertex AI 経由に切替（GCP credit 使用可） |
| `GCP_PROJECT_ID` | Vertex 時 | GCP プロジェクト ID |
| `GCP_LOCATION` | No | デフォルト `global` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Vertex 時 | Service Account JSON パス |
| `DATABASE_URL` | Yes | PostgreSQL 接続 URL |
| `SALESFORCE_INSTANCE_URL` | No | SF インスタンス URL |
| `SALESFORCE_CLIENT_ID` | No | SF クライアント ID |
| `SALESFORCE_CLIENT_SECRET` | No | SF クライアントシークレット |
| `KINTONE_SUBDOMAIN` | No | Kintone サブドメイン |
| `KINTONE_API_TOKEN` | No | Kintone API トークン |
| `KINTONE_APP_ID` | No | Kintone アプリ ID |

## セットアップ

rag-deploy の Docker Compose で自動起動されるため、単体セットアップは不要。

```bash
# rag-deploy からのビルド・起動
cd ../
docker compose --profile prod build
docker compose --profile prod up -d
```

## Kintone モックデータ

Kintone API 未接続時は 5 件のサンプル商談を自動返却（デモ用）：

| ID | 会社名 | 案件名 | 金額 |
|----|-------|--------|------|
| KTN-1001 | セブン&アイ | 基幹システムDX化 | 3,600万 |
| KTN-1002 | 大和ハウス | 社内FAQ AIチャットボット | 950万 |
| KTN-1003 | ダイキン工業 | 製造現場ナレッジ継承AI | 2,800万 |
| KTN-1004 | 野村證券 | 営業会議録AI自動化 | 1,400万 |
| KTN-1005 | ヤマトHD | 物流最適化×AI分析基盤 | 4,500万 |

## ライセンス

MIT
