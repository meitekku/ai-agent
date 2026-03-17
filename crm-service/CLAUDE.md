# crm-service — CRM 連携 + 提案書生成マイクロサービス

AIAgent-performance の提案書機能（Salesforce/Kintone 連携、商機分析、PPTX 生成）を rag-deploy 向けに移植した Bun + Hono マイクロサービス。Docker 内部通信専用（port 8009）。

## 元プロジェクト

`~/Desktop/AIAgent-performance/AIAgent-performance/frontend/src/app/api/proposal/` から移植。
元は Next.js API Routes + マルチ AI プロバイダー（Gemini/Claude/ChatGPT）だったが、rag-deploy に合わせて **Gemini only** に統一。

## アーキテクチャ

```
rag-ui (chat tool calling)
  │
  ├── listDeals ────────▶ POST /sf/list or /kintone/list
  ├── fetchDealData ────▶ POST /sf/fetch or /kintone/fetch
  ├── searchKnowledgeBase ─▶ KB/Web 検索 → additionalContext として収集
  ├── analyzeDeal(+additionalContext) ──────▶ POST /deals/analyze
  ├── reviseRationale(+additionalContext) ──▶ POST /deals/revise-rationale
  └── generateProposal(+additionalContext) ─▶ signal tool → ProposalPanel → POST /proposal/generate-pptx
```

rag-ui の `/api/chat/route.ts` で CRM 系 tool を定義 → execute 内で `http://crm-service:8009` に HTTP リクエスト → 結果を LLM に返却。

### additionalContext 連携

`analyzeDeal`、`reviseRationale`、`generateProposal` の 3 ツールは `additionalContext?: string` パラメータを持つ。LLM がこれらを呼ぶ前に `searchKnowledgeBase` や `webSearch` で収集した情報を `additionalContext` として渡すことで、分析・提案書生成にナレッジベースやウェブ検索の情報が反映される。crm-service 側では `lib/prompts.ts` の各プロンプトビルダーに注入。

## ディレクトリ構造

```
crm-service/
├── Dockerfile                    # oven/bun:1, CMD ["bun", "run", "src/index.ts"]
├── .dockerignore
├── package.json                  # hono, pg, @google/generative-ai, jsforce, xlsx, pptxgenjs
├── tsconfig.json
└── src/
    ├── index.ts                  # Hono app (port 8009) + route registration
    ├── routes/
    │   ├── health.ts             # GET /health
    │   ├── salesforce.ts         # POST /sf/check, /sf/list, /sf/fetch
    │   ├── kintone.ts            # POST /kintone/list, /kintone/fetch（モックフォールバック）
    │   ├── parse-file.ts         # POST /deals/parse-file（XLSX/CSV/TXT）
    │   ├── analyze.ts            # POST /deals/analyze（スコアリング + Gemini 根拠生成）
    │   ├── rationale.ts          # POST /deals/revise-rationale（フィードバック修正）
    │   ├── solution-qa.ts        # POST /deals/solution-qa（マルチターン Q&A）
    │   ├── templates.ts          # GET/POST/DELETE/PATCH /templates, POST /templates/detect
    │   └── proposal-pptx.ts      # POST /proposal/generate-pptx（AI 計画 + pptxgenjs）
    └── lib/
        ├── gemini.ts             # GoogleGenerativeAI wrapper
        ├── db.ts                 # pg Pool + ensureCrmTables()
        ├── scoring.ts            # 商機評分アルゴリズム
        ├── prompts.ts            # 全 AI プロンプト
        └── types.ts              # SFData, AnalysisResult, PresentationPlan, etc.
```

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/health` | ヘルスチェック |
| POST | `/sf/check` | SF 利用可能オブジェクト一覧 |
| POST | `/sf/list` | SF 商談一覧（Opportunity → Lead → Account フォールバック） |
| POST | `/sf/fetch` | SF 商談詳細（12 種データ一括取得） |
| POST | `/kintone/list` | Kintone レコード一覧（API 未接続時モックフォールバック） |
| POST | `/kintone/fetch` | Kintone レコード詳細 → SFData 形式に正規化 |
| POST | `/deals/parse-file` | ファイルベース案件インポート（FormData: XLSX/CSV/TXT） |
| POST | `/deals/analyze` | 商機分析（スコアリング + AI 根拠生成） |
| POST | `/deals/revise-rationale` | フィードバックで分析根拠修正 |
| POST | `/deals/solution-qa` | マルチターン会話 Q&A（Gemini startChat） |
| GET | `/templates` | 提案テンプレート一覧 |
| POST | `/templates` | テンプレートアップロード（FormData） |
| DELETE | `/templates` | テンプレート削除 |
| PATCH | `/templates` | サービス名更新 |
| POST | `/templates/detect` | AI サービス名自動検出 + 類似度チェック |
| POST | `/proposal/generate-pptx` | AI スライド計画 → pptxgenjs PPTX 生成 |

## DB スキーマ

共用 PostgreSQL（lightrag DB）に 3 テーブル自動作成:

| テーブル | 用途 |
|---------|------|
| `proposal_templates` | 提案テンプレート（name UNIQUE, file_data BYTEA, service_name, content_text） |
| `crm_deal_cache` | CRM データキャッシュ（source, external_id, deal_data JSONB, analysis JSONB） |
| `proposal_history` | 提案書生成履歴（deal_data, analysis, pptx_plan JSONB） |

## スコアリングアルゴリズム（lib/scoring.ts）

- **受注確率**: stage_score×60% + SF_probability×20% + activity_bonus×15% + contact_bonus×10%
- **活動スコア**: 7日以内+20, 14日+15, 30日+10, 60日+5, 以上+2 (上限100)
- **提案準備度**: 説明+20, コンタクト+5×人数, 活動+20%, 予算+15, 期限+10, ネクストステップ+10, 業界+5
- **エンゲージメント**: 活動×0.7 + コンタクト×3 → 高(≥70)/中(≥40)/低
- **3 シナリオ**: 楽観(+0.20, ×1.10), 標準, 悲観(-0.25, ×0.75)

## 提案書 PPTX 生成（routes/proposal-pptx.ts）

1. DB から提案テンプレート取得 → content_text をプロンプトに注入
2. Gemini が JSON でスライド計画生成（theme + slides[]）
3. pptxgenjs で 5 レイアウト（title/content/two-column/cards/closing）をレンダリング
4. バイナリ PPTX をレスポンス

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `GEMINI_API_KEY` | Yes | Gemini API Key |
| `GEMINI_MODEL` | No | デフォルト `gemini-2.5-flash` |
| `DATABASE_URL` | Yes | PostgreSQL 接続 URL |
| `SALESFORCE_INSTANCE_URL` | No | SF OAuth2 インスタンス URL |
| `SALESFORCE_CLIENT_ID` | No | SF OAuth2 クライアント ID |
| `SALESFORCE_CLIENT_SECRET` | No | SF OAuth2 クライアントシークレット |
| `KINTONE_SUBDOMAIN` | No | Kintone サブドメイン |
| `KINTONE_API_TOKEN` | No | Kintone API トークン |
| `KINTONE_APP_ID` | No | Kintone アプリ ID |
| `PORT` | No | デフォルト `8009` |

## 開発コマンド

```bash
# ローカル起動（DB 必要）
bun run dev

# Docker ビルド
docker compose --profile prod build crm-service

# ヘルスチェック
curl http://localhost:8009/health
```

## Kintone モックデータ

Kintone API 未接続時は 5 件のサンプル商談を自動返却:

| ID | 会社名 | 案件名 | 金額 |
|----|-------|--------|------|
| KTN-1001 | セブン&アイ | 基幹システムDX化 | 3,600万 |
| KTN-1002 | 大和ハウス | 社内FAQ AIチャットボット | 950万 |
| KTN-1003 | ダイキン工業 | 製造現場ナレッジ継承AI | 2,800万 |
| KTN-1004 | 野村證券 | 営業会議録AI自動化 | 1,400万 |
| KTN-1005 | ヤマトHD | 物流最適化×AI分析基盤 | 4,500万 |

各商談に活動履歴・コンタクト情報付き（KTN-1005 はデータ不足テスト用）。

## 注意事項

- **jsforce + Bun 互換性**: jsforce は Node.js ライブラリ。Bun で問題が出た場合は Dockerfile を `node:22-slim` ベースに切替
- **Tool result サイズ**: rag-ui の `fetchDealData` execute 内で活動/メール/Feed を各 5 件に truncate（トークン過多防止）
- **テンプレートストレージ**: ファイルシステム（元プロジェクト）→ PostgreSQL BYTEA に移行
- **AI プロバイダー**: 元は Gemini/Claude/ChatGPT 選択式 → Gemini only に統一
