# crm-service

CRM 連携 + 提案書生成マイクロサービス。Salesforce / Kintone からの商談データ取得、AI 商機分析、PPTX 提案書生成を提供。

## 機能

- **Salesforce 連携** — OAuth2 認証、商談一覧・詳細取得（12 種 SF オブジェクト対応）
- **Kintone 連携** — API トークン認証、レコード一覧・詳細取得（モックフォールバック）
- **ファイルインポート** — XLSX / CSV / TXT から案件データ自動抽出
- **商機分析** — 受注確率、スコアリング、3 シナリオ、AI 根拠生成
- **提案書 PPTX** — AI がスライド構成を設計、pptxgenjs でレンダリング
- **テンプレート管理** — PostgreSQL BYTEA ストレージ、AI サービス名自動検出

## 技術スタック

- [Bun](https://bun.sh/) ランタイム
- [Hono](https://hono.dev/) Web フレームワーク
- [Gemini API](https://ai.google.dev/) AI 分析・生成
- [jsforce](https://jsforce.github.io/) Salesforce 接続
- [pptxgenjs](https://gitbrent.github.io/PptxGenJS/) PowerPoint 生成
- [xlsx](https://sheetjs.com/) Excel パース
- PostgreSQL（共用 DB）

## セットアップ

rag-deploy の Docker Compose で自動起動されるため、単体セットアップは不要。

```bash
# rag-deploy からのビルド・起動
cd ../
docker compose --profile prod build
docker compose --profile prod up -d
```

## ライセンス

MIT
