import type { SFData, AnalysisResult, R } from "./types";

const STAGE_WIN_RATE: Record<string, number> = {
  // English (Salesforce default)
  Prospecting: 0.10, Qualification: 0.20, "Needs Analysis": 0.30,
  "Value Proposition": 0.40, "Id. Decision Makers": 0.50, "Perception Analysis": 0.55,
  "Proposal/Price Quote": 0.65, Proposal: 0.65, Negotiation: 0.80, "Negotiation/Review": 0.80,
  "Closed Won": 1.00, "Closed Lost": 0.00,
  // Japanese
  "見込み": 0.10, "初期調査": 0.20, "ヒアリング": 0.30, "商談中": 0.35,
  "提案中": 0.50, "提案済み": 0.55, "見積提出": 0.65, "交渉中": 0.80,
  "受注": 1.00, "失注": 0.00,
  // Kintone CSV statuses
  "引き合い": 0.15, "初回訪問": 0.25, "提案": 0.50, "見積": 0.65, "契約": 0.85,
};

function getStageScore(stageName: string): number {
  // Exact match first
  if (STAGE_WIN_RATE[stageName] !== undefined) return STAGE_WIN_RATE[stageName];
  // Partial match
  const lower = stageName.toLowerCase();
  for (const [key, val] of Object.entries(STAGE_WIN_RATE)) {
    if (lower.includes(key.toLowerCase())) return val;
  }
  return 0.30;
}

function getDaysUntilClose(closeDate: string): number {
  if (!closeDate) return 90;
  return Math.ceil((new Date(closeDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function getDealAgeInDays(createdDate: string): number {
  if (!createdDate) return 30;
  return Math.ceil((Date.now() - new Date(createdDate).getTime()) / (1000 * 60 * 60 * 24));
}

function getActivityScore(activities: { ActivityDate?: string }[]): number {
  if (activities.length === 0) return 0;
  let score = 0;
  for (const act of activities) {
    const daysAgo = (Date.now() - new Date(act.ActivityDate || new Date()).getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo <= 7) score += 20;
    else if (daysAgo <= 14) score += 15;
    else if (daysAgo <= 30) score += 10;
    else if (daysAgo <= 60) score += 5;
    else score += 2;
  }
  return Math.min(100, score);
}

// ---------------------------------------------------------------------------
// Additive scoring — only award points for data that exists, never penalize
// missing fields. Works honestly for both CRM and manual input.
// ---------------------------------------------------------------------------

export function analyzeData(data: SFData): Omit<AnalysisResult, "rationale"> {
  const opp = data.opportunity;
  // Ensure arrays exist (some deals may lack contacts/activities)
  if (!data.contacts) data.contacts = [];
  if (!data.activities) data.activities = [];
  if (!data.account) data.account = {} as SFData["account"];
  const stageScore = getStageScore(opp.StageName || "");
  const activityScore = getActivityScore(data.activities);
  const prob = opp.Probability ?? 0;

  // --- Win Probability (base: stage, bonuses for additional data) ---
  // Stage is the foundation (worth up to 0.60)
  // Additional data adds bonuses on top
  let winProb = stageScore * 0.60;
  if (prob > 0) winProb += (prob / 100) * 0.20;
  if (activityScore > 0) winProb += (activityScore / 100) * 0.10;
  if (data.contacts.length > 0) winProb += Math.min(0.05, data.contacts.length * 0.015);
  if (opp.Description) winProb += 0.03;
  if ((opp.Amount ?? 0) > 0) winProb += 0.02;
  winProb = Math.min(0.95, winProb);

  // --- Deal Health Score (0-100, additive) ---
  let health = 0;
  health += stageScore * 35;                                         // up to 35
  if (prob > 0) health += (prob / 100) * 20;                         // up to 20
  if (activityScore > 0) health += (activityScore / 100) * 15;       // up to 15
  if (data.contacts.length > 0) health += Math.min(10, data.contacts.length * 3); // up to 10
  if (opp.Description) health += 8;
  if ((opp.Amount ?? 0) > 0) health += 7;
  if (opp.NextStep) health += 5;
  const dealHealthScore = Math.min(100, Math.round(health));

  // --- Engagement Level ---
  const engageTotal = activityScore * 0.7 + data.contacts.length * 3;
  // If no CRM engagement data, base on what info we have
  const engagementLevel = (data.activities.length === 0 && data.contacts.length === 0)
    ? "—"
    : engageTotal >= 70 ? "高" : engageTotal >= 40 ? "中" : "低";

  // --- Proposal Readiness (0-100, additive) ---
  let readiness = 20; // base: we're in a conversation
  if (opp.Description) readiness += 20;
  if ((opp.Amount ?? 0) > 0) readiness += 15;
  if (data.account.Industry) readiness += 5;
  if (opp.CloseDate) readiness += 10;
  if (opp.NextStep) readiness += 10;
  if (data.contacts.length > 0) readiness += Math.min(10, data.contacts.length * 5);
  if (activityScore > 0) readiness += Math.round(activityScore * 0.1);
  const proposalReadiness = Math.min(100, readiness);

  // --- Scenarios ---
  const amount = opp.Amount || 0;
  const daysUntilClose = getDaysUntilClose(opp.CloseDate || "");
  const dealAge = getDealAgeInDays(opp.CreatedDate || "");

  const scenarios = {
    optimistic: {
      label: "楽観シナリオ", probability: Math.min(0.95, winProb + 0.20),
      expectedRevenue: amount * 1.10,
      timeline: daysUntilClose > 0 ? `${Math.max(7, daysUntilClose - 14)}日以内` : "即時クローズ可能",
      conditions: ["意思決定者との直接面談を早期実施", "競合他社より先行して提案書提出", "追加割引または特典の提供", "経営層のスポンサー獲得"],
    },
    base: {
      label: "標準シナリオ", probability: winProb, expectedRevenue: amount,
      timeline: daysUntilClose > 0 ? `${daysUntilClose}日` : "要再設定",
      conditions: ["現在のエンゲージメント水準を維持", "クローズ予定日どおりに進捗", "既存の要件・予算での合意"],
    },
    pessimistic: {
      label: "悲観シナリオ", probability: Math.max(0.05, winProb - 0.25),
      expectedRevenue: amount * 0.75, timeline: `${daysUntilClose + 30}日以上`,
      conditions: ["予算削減・凍結リスク", "競合案件との比較検討長期化", "意思決定プロセスの複雑化", "スコープ縮小での再提案が必要"],
    },
  };

  // --- Key Drivers (only positive signals that actually exist) ---
  const keyDrivers: string[] = [];
  if ((opp.Amount ?? 0) > 1000000) keyDrivers.push("大型案件（高い戦略的優先度）");
  if (prob >= 60) keyDrivers.push(`商談確度${prob}%（高確度）`);
  if (data.activities.length >= 5) keyDrivers.push(`活発な商談活動（直近${data.activities.length}件のアクティビティ）`);
  if (data.contacts.length >= 3) keyDrivers.push(`複数のキーパーソンとの関係構築済み（${data.contacts.length}名）`);
  if (opp.LeadSource) keyDrivers.push(`${opp.LeadSource}経由のリード（信頼性の高いソース）`);
  if (data.account.Industry) keyDrivers.push(`${data.account.Industry}業界への深い知見`);
  if (opp.NextStep) keyDrivers.push("明確なネクストステップ設定済み");
  if (opp.Description) keyDrivers.push("明確な課題・要件の提示あり");
  if (keyDrivers.length < 3) keyDrivers.push("既存顧客との信頼関係", "製品適合性の高い要件");

  // --- Risk Factors (only real risks, not missing-data complaints) ---
  const riskFactors: string[] = [];
  if (daysUntilClose < 14 && daysUntilClose > 0) riskFactors.push("クローズ期限が迫っている（2週間以内）");
  if (opp.CloseDate && daysUntilClose < 0) riskFactors.push("クローズ予定日超過（再スケジューリング必要）");
  if (opp.CreatedDate && dealAge > 180) riskFactors.push("商談長期化（6ヶ月超）による失注リスク");
  if (prob > 0 && prob < 30) riskFactors.push(`商談確度低（${prob}%）`);
  // Generic risks as baseline
  if (riskFactors.length === 0) riskFactors.push("競合他社の存在", "予算承認プロセスの不明確さ");
  if (riskFactors.length < 2) riskFactors.push("意思決定プロセスの長期化リスク");

  // --- Recommended Actions (context-aware) ---
  const recommendedActions: string[] = [];
  if (data.contacts.length === 0) recommendedActions.push("意思決定者・キーパーソンの特定とアプローチ");
  if (data.activities.length === 0) recommendedActions.push("初回ヒアリングで課題の深掘りを実施");
  if (!opp.NextStep) recommendedActions.push("具体的なネクストステップと日程の設定");
  if (daysUntilClose > 0 && daysUntilClose < 30) recommendedActions.push("エグゼクティブスポンサーとの面談を早期設定");
  if (winProb < 0.5) recommendedActions.push("競合差別化ポイントを強調したカスタム提案書を作成");
  recommendedActions.push("ROIシミュレーション資料を用いた経営判断サポート");
  recommendedActions.push("パイロット案件での早期導入効果実証を提案");

  return {
    winProbability: Math.round(winProb * 100), dealHealthScore, activityScore: Math.round(activityScore),
    engagementLevel, proposalReadiness, scenarios,
    keyDrivers: keyDrivers.slice(0, 5),
    riskFactors: riskFactors.slice(0, 5),
    recommendedActions: recommendedActions.slice(0, 5),
  };
}
