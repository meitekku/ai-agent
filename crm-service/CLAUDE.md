# crm-service — CRM 連携 + 提案書生成マイクロサービス

AIAgent-performance の提案書機能（Salesforce/Kintone 連携、商機分析、PPTX 生成）を rag-deploy 向けに移植した Bun + Hono マイクロサービス。Docker 内部通信専用（port 8009）。

## 元プロジェクト

`~/Desktop/AIAgent-performance/AIAgent-performance/frontend/src/app/api/proposal/` から移植。
元は Next.js API Routes + マルチ AI プロバイダー（Gemini/Claude/ChatGPT）だったが、rag-deploy に合わせて **Gemini only** に統一。

## アーキテクチャ

```
rag-ui (chat tool calling)
  │
  ├── listDeals ────────────▶ POST /sf/list or /kintone/list
  ├── fetchAndAnalyze ──────▶ CRM fetch + KB全検索 + Web検索 + POST /deals/analyze → session 保存 → sessionKey 返却で ProposalPanel 自動開放
  └── reviseRationale ──────▶ session から分析取得 → POST /deals/revise-rationale → マージ更新

ProposalPanel (フロントエンド)
  │
  ├── GET /api/crm/proposal-session/{key} → session データ取得
  ├── GET /api/crm/templates ────────────▶ GET /templates → テンプレート一覧
  └── 分析表示 → テンプレート確認 → スタイル設定 → SlidePanel（既存 HTML スライド機能）へ遷移
```

rag-ui の `/api/chat/route.ts` で CRM 系 tool を定義。`fetchAndAnalyze` が CRM データ取得 + KB 全検索 + Web 検索 + 分析を一括実行し、結果をインメモリセッション（TTL 1h）に保存。sessionKey を返却すると ProposalPanel が自動的に開く（`generateProposal` は廃止）。

### Tool 統合（v2→v3）

旧 v1: `fetchDealData` → `searchKnowledgeBase` × N → `webSearch` → `analyzeDeal` → `generateProposal`（7 tool 呼出、~20K tokens）
v2: `fetchAndAnalyze`（内部で CRM + KB + Web + analyze を一括実行）→ `generateProposal`（2-3 tool 呼出、~6K tokens）
v3（現行）: `fetchAndAnalyze` のみ（sessionKey 返却で ProposalPanel 自動開放）。`generateProposal` は廃止。2 tool（listDeals → fetchAndAnalyze）、~6K tokens

### 手動入力対応

`fetchAndAnalyze` は `source: "manual"` + `manualInput: { companyName, industry, dealName, challenges, budget, ... }` で CRM データ源なしのデモも可能。内部で SFData 形式に変換。

### additionalContext 連携

`fetchAndAnalyze` の execute 内で KB 全検索 + Web 検索を自動実行し、結果を `additionalContext` として crm-service の `/deals/analyze` に渡す。LLM が個別に検索する必要がなくなり、確実性が向上。

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
    │   └── proposal-pptx.ts      # POST /proposal/generate-pptx, /generate-plan, /render-pptx, /revise-slide
    └── lib/
        ├── gemini.ts             # Gemini wrapper（AI Studio / Vertex AI デュアルモード）
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
| POST | `/proposal/generate-pptx` | AI スライド計画 → pptxgenjs PPTX 生成（レガシー、一括実行） |
| POST | `/proposal/generate-plan` | AI スライド計画 JSON のみ生成（PPTX レンダリングなし） |
| POST | `/proposal/render-pptx` | PresentationPlan JSON → pptxgenjs PPTX 生成（AI 不要） |
| POST | `/proposal/revise-slide` | 1 スライドのみ AI 修正（plan + slideIndex + instruction） |

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

### レガシーエンドポイント（`/proposal/generate-pptx`）
1. DB から提案テンプレート取得 → content_text をプロンプトに注入
2. Gemini が JSON でスライド計画生成（theme + slides[]）— maxTokens 16000
3. pptxgenjs で 5 レイアウト（title/content/two-column/cards/closing）をレンダリング
4. バイナリ PPTX をレスポンス

### 分割エンドポイント（v2、ProposalPanel 用）
- **`/proposal/generate-plan`**: ステップ 1-2 のみ実行 → PresentationPlan JSON を返却（maxTokens 16000）
- **`/proposal/render-pptx`**: ステップ 3-4 のみ実行 → plan JSON から PPTX バイナリ生成（AI 不要）
- **`/proposal/revise-slide`**: plan + slideIndex + instruction → `buildSlideRevisionPrompt()` で Gemini に 1 スライドだけ修正させ、修正後の SlideDefinition を返却

### JSON 切断対策
Gemini の出力が長い場合、JSON が途中で切れることがある。`generate-plan` と `generate-pptx` で切断 JSON 自動修復を実装：未閉じの `[` `{` を検出し、対応する閉じ括弧を自動追加してパース。

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `GEMINI_API_KEY` | AI Studio 時 | Gemini API Key（Vertex AI 使用時は不要） |
| `GEMINI_MODEL` | No | デフォルト `gemini-3-flash-preview`（リクエスト body の `model` フィールドで上書き可） |
| `USE_VERTEX_AI` | No | `true` で Vertex AI 経由に切替（GCP Free Trial credit 使用可） |
| `GCP_PROJECT_ID` | Vertex 時 | GCP プロジェクト ID |
| `GCP_LOCATION` | No | GCP リージョン（デフォルト `global`） |
| `GOOGLE_APPLICATION_CREDENTIALS` | Vertex 時 | Service Account JSON パス |
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
- **Tool result サイズ**: rag-ui の `fetchAndAnalyze` execute 内で活動/メール/Feed を各 5 件に truncate（トークン過多防止）
- **テンプレートストレージ**: ファイルシステム（元プロジェクト）→ PostgreSQL BYTEA に移行
- **AI プロバイダー**: 元は Gemini/Claude/ChatGPT 選択式 → Gemini only に統一
