import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod Schema — matches ProposalPanel's expected analysis data shape exactly
// ---------------------------------------------------------------------------

const ServiceRecommendationSchema = z.object({
  service: z.string().describe("サービス名（DX開発サービス/AI RAG Agent/書きあげクン）"),
  relevance: z.enum(["primary", "secondary", "optional"]).describe("関連度"),
  reason: z.string().describe("推薦理由"),
  features: z.array(z.string()).describe("活用する機能"),
});

const ScenarioSchema = z.object({
  label: z.string().describe("シナリオ名"),
  probability: z.number().describe("確率（0-100）"),
  expectedRevenue: z.number().describe("予想売上（円）"),
  timeline: z.string().describe("タイムライン"),
  conditions: z.array(z.string()).describe("条件"),
});

export const DealAnalysisSchema = z.object({
  // Scores (AI-generated)
  winProbability: z.number().min(0).max(100).describe("受注確率（%）"),
  dealHealthScore: z.number().min(0).max(100).describe("商談健全度"),
  proposalReadiness: z.number().min(0).max(100).describe("提案準備度"),
  activityScore: z.number().min(0).max(100).describe("活動スコア"),
  engagementLevel: z.string().describe("エンゲージメントレベル（高/中/低/—）"),

  // Drivers & risks
  keyDrivers: z.array(z.string()).describe("成功要因"),
  riskFactors: z.array(z.string()).describe("リスク要因"),
  recommendedActions: z.array(z.string()).describe("推奨アクション"),

  // Scenarios
  scenarios: z.object({
    optimistic: ScenarioSchema.describe("楽観シナリオ"),
    base: ScenarioSchema.describe("標準シナリオ"),
    pessimistic: ScenarioSchema.describe("悲観シナリオ"),
  }),

  // Rationale (nested object consumed by ProposalPanel)
  rationale: z.object({
    customerChallenges: z.array(z.string()).describe("顧客の課題"),
    serviceRecommendations: z.array(ServiceRecommendationSchema).describe("推薦サービス（1〜3個）"),
    combinedSolution: z.string().describe("総合ソリューション説明（2〜3文）"),
    existingProposalHints: z.array(z.string()).describe("提案書に含めるべきポイント"),
    proposalJudgment: z.enum(["existing_service", "dx_development", "not_proposable"]).describe("提案判定"),
    proposalJudgmentReason: z.string().describe("判定理由"),
    expectedKPIs: z.array(z.string()).optional().describe("期待されるKPI"),
    nextActions: z.array(z.string()).optional().describe("次のステップ"),
  }),
});

export type DealAnalysis = z.infer<typeof DealAnalysisSchema>;

// ---------------------------------------------------------------------------
// Types for CRM data (matching crm-service SFData shape)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

interface SFData {
  account: { Name?: string; Industry?: string; Description?: string; NumberOfEmployees?: number; [k: string]: unknown };
  opportunity: {
    Name?: string; Amount?: number; StageName?: string; CloseDate?: string;
    Probability?: number; Description?: string; LeadSource?: string;
    CreatedDate?: string; NextStep?: string; [k: string]: unknown;
  };
  activities: R[];
  contacts: R[];
  events?: R[];
  feedItems?: R[];
  notes?: R[];
  cases?: R[];
  contracts?: R[];
  quotes?: R[];
  lineItems?: R[];
  emails?: R[];
}

// ---------------------------------------------------------------------------
// Prompt builder — ported from crm-service prompts.ts + scoring.ts guidance
// ---------------------------------------------------------------------------

export function buildAnalysisPrompt(
  data: SFData,
  additionalContext?: string,
  templateServices?: string[],
): string {
  const opp = data.opportunity;
  const account = data.account;

  // --- CRM data section ---
  const parts: string[] = [`## 顧客・商談データ
- 会社名: ${account.Name || "不明"}
- 業界: ${account.Industry || "未設定"}
- 従業員数: ${account.NumberOfEmployees || "不明"}
- 商談名: ${opp.Name || "不明"}
- 説明: ${opp.Description || "なし"}
- 予算（金額）: ${opp.Amount ? `${opp.Amount.toLocaleString()}円` : "未設定"}
- ステージ: ${opp.StageName || "未設定"}
- 確度: ${opp.Probability ?? "未設定"}%
- クローズ予定日: ${opp.CloseDate || "未設定"}
- 作成日: ${opp.CreatedDate || "不明"}
- リードソース: ${opp.LeadSource || "不明"}
- ネクストステップ: ${opp.NextStep || "なし"}`];

  if (data.contacts?.length > 0) {
    const contactLines = data.contacts.slice(0, 10).map(
      (c: R) => `${c.LastName || ""}${c.FirstName || ""}（${c.Title || "役職不明"}）`,
    );
    parts.push(`\nコンタクト（${data.contacts.length}名）: ${contactLines.join("、")}`);
  }

  if (data.activities?.length > 0) {
    const actLines = data.activities.slice(0, 10).map(
      (a: R) => `[${a.ActivityDate || "日付不明"}] ${a.Subject || a.Description || "詳細なし"}`,
    );
    parts.push(`\n活動記録（${data.activities.length}件）:\n${actLines.join("\n")}`);
  }

  if (data.events && data.events.length > 0) {
    const eventLines = data.events.slice(0, 5).map(
      (e: R) => `[${e.StartDateTime || ""}] ${e.Subject || ""}`,
    );
    parts.push(`\n会議・訪問（${data.events.length}件）:\n${eventLines.join("\n")}`);
  }

  if (data.cases && data.cases.length > 0) {
    parts.push(`\n問い合わせ（${data.cases.length}件）: ${data.cases.slice(0, 3).map((c: R) => c.Subject || "").filter(Boolean).join("、")}`);
  }

  if (data.feedItems && data.feedItems.length > 0) {
    parts.push(`\nChatter/日報: ${data.feedItems.slice(0, 3).map((f: R) => (f.Body || "").slice(0, 100)).filter(Boolean).join(" / ")}`);
  }

  if (data.emails && data.emails.length > 0) {
    parts.push(`\nメール件名: ${data.emails.slice(0, 5).map((e: R) => e.Subject || "").filter(Boolean).join("、")}`);
  }

  if (data.contracts && data.contracts.length > 0) {
    parts.push(`\n契約情報（${data.contracts.length}件）: ${data.contracts.slice(0, 3).map((c: R) => `${c.ContractNumber || ""} ${c.Status || ""}`).join("、")}`);
  }

  if (data.quotes && data.quotes.length > 0) {
    parts.push(`\n見積（${data.quotes.length}件）: ${data.quotes.slice(0, 3).map((q: R) => `${q.Name || ""}: ${q.TotalPrice || 0}円`).join("、")}`);
  }

  // --- Template section ---
  const templateSection = templateServices && templateServices.length > 0
    ? `## 社内にアップロード済みの紹介資料・提案書テンプレート\n${templateServices.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : `## 社内にアップロード済みの紹介資料・提案書テンプレート\n（現在アップロードなし）`;

  // --- Additional context ---
  const contextSection = additionalContext
    ? `\n## 追加コンテキスト（ナレッジベース・ウェブ検索等の外部情報）\n以下の情報も分析に反映してください。顧客の業界動向、競合情報、技術トレンド等が含まれる場合は、課題分析やサービス推薦の根拠として活用してください。\n\n${additionalContext}`
    : "";

  return `あなたはDXソリューション企業の法人営業コンサルタントです。以下の商談データを分析してください。

${parts.join("\n")}

## スコアリング指針

### 受注確率（winProbability, 0-100%）
- ステージが最も重要な指標（見込み=10%, ヒアリング=30%, 提案中=50%, 交渉中=80%, 受注=100%）
- 確度（Probability）が設定されていれば参考にする
- アクティビティの頻度・新しさ、コンタクト数、課題の明確度で加減点
- データが少ない場合は控えめに（30-40%程度）

### 商談健全度（dealHealthScore, 0-100）
- ステージ進捗（35点）、確度（20点）、活動スコア（15点）、コンタクト数（10点）を加算
- 説明あり+8、予算設定+7、ネクストステップ+5

### 活動スコア（activityScore, 0-100）
- 7日以内のアクティビティ: +20/件
- 14日以内: +15/件、30日以内: +10/件、60日以内: +5/件
- アクティビティなし: 0

### エンゲージメント（engagementLevel）
- 活動スコア×0.7 + コンタクト数×3 で判定: ≥70=高, ≥40=中, <40=低
- アクティビティもコンタクトもなし: "—"

### 提案準備度（proposalReadiness, 0-100）
- ベース20 + 説明あり+20 + 予算+15 + 業界+5 + 期限+10 + ネクストステップ+10 + コンタクト+10

### シナリオ
- 楽観: 受注確率+20%、売上×1.10、期限-14日
- 標準: そのまま
- 悲観: 受注確率-25%、売上×0.75、期限+30日

## 分析ガイドライン（この基準に従って判定すること）

### 成功要因（keyDrivers）の判定基準
以下に該当する項目のうち、**この商談に実際に当てはまるもののみ**を挙げること。当てはまらないものは含めない。
- **予算規模**: 500万以上→中規模案件、1000万以上→大型案件（戦略的優先度が高い）
- **意思決定者**: 役員・部長クラスのコンタクトがいる場合、意思決定が早い可能性
- **課題の明確度**: Description に具体的な課題・要件が記載されている場合
- **業界知見**: 業界が明記されており、弊社に当該業界の実績がある場合
- **商談進捗**: ステージが「提案中」以降、または確度50%以上の場合
- **エンゲージメント**: 直近30日以内にアクティビティがある場合
- **リードソース**: 紹介・既存顧客からのリードは信頼性が高い
上記に該当しない場合は、成功要因を2個以下に抑えること。無理に3個以上並べない。

### リスク要因（riskFactors）の判定基準
以下に該当する項目のうち、**この商談に実際に当てはまるもののみ**を挙げること。
- **期限切迫**: クローズ予定日まで14日以内
- **期限超過**: クローズ予定日が過ぎている
- **長期停滞**: 商談作成から180日以上経過しステージが進んでいない
- **低確度**: 確度30%未満
- **予算未確定**: 金額が未設定、または予算承認プロセスが不明
- **競合**: Description やアクティビティに競合他社の言及がある場合
- **コンタクト不足**: 意思決定者が未特定（コンタクト0名）
- **エンゲージメント低下**: 直近60日以上アクティビティなし
該当なしの場合は「現時点で顕著なリスクなし」とだけ書くこと。汎用的なリスク（例:「競合の存在」）を根拠なく追加しない。

### 推奨アクション（recommendedActions）の判定基準
上記の成功要因・リスク要因を踏まえ、**次の1〜2週間で実行すべき具体的なアクション**を挙げること。
- リスクがあれば、そのリスクを軽減するアクション
- 成功要因を活かすための次のステップ
- 汎用的な文言（例:「ROI試算資料の作成」）ではなく、この商談の状況に合わせた具体的な内容にする

## 弊社の製品・サービス
1. **DX開発サービス**: カスタムDXソリューション設計・開発、レガシーシステム刷新、業務プロセス自動化、API連携、Web/モバイルアプリ開発、データ基盤構築
2. **AI RAG Agent**: RAGベースのAI質問応答システム、社内ナレッジ検索、ドキュメント自動分類・検索、商談分析・提案書自動生成
3. **書きあげクン**: AI音声文字起こし、会議録・議事録自動作成、多言語対応、要約・キーポイント抽出

### サービス推薦ルール（重要）
- **顧客の課題に本当に関連するサービスのみを推薦すること**。全サービスを無理に含める必要はない
- 顧客の課題・ニーズに明確な関連がないサービスは推薦しない（例: 会議録のニーズがなければ書きあげクンは不要）
- 推薦数は1〜3個。課題に直結するものだけを厳選する
- relevance は正確に判定する: primary（核心課題の解決）、secondary（補完的価値）、optional（あれば便利だが必須ではない）

${templateSection}
${contextSection}

## 提案判定ルール（proposalJudgment）
以下の優先順位で判定してください：

1. **"existing_service"**（既存サービスで対応可能）
   - 上記のアップロード済みテンプレートの中に、顧客の課題・ニーズに合致するサービスが存在する場合

2. **"dx_development"**（DX新規開発を推薦）
   - 既存テンプレートに合致するサービスがない、またはテンプレートが未アップロードの場合
   - ただし、顧客の予算・規模・課題がDX新規開発で対応可能な範囲であること
   - 目安：予算が100万円以上、または明確な業務課題がある場合

3. **"not_proposable"**（提案不可）
   - 顧客の予算が極端に低く（目安：10万円未満）かつ要件が大規模・複雑な場合
   - 顧客の業界・規制上の制約でサービス提供が困難な場合
   - 技術的・物理的に実現不可能な要件がある場合`;
}
