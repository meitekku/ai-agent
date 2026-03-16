import type { SFData, AnalysisResult, AnalysisRationale, R } from "./types";

const STAGE_WIN_RATE: Record<string, number> = {
  Prospecting: 0.10, Qualification: 0.20, "Needs Analysis": 0.30,
  "Value Proposition": 0.40, "Id. Decision Makers": 0.50, "Perception Analysis": 0.55,
  "Proposal/Price Quote": 0.65, "Negotiation/Review": 0.80, "Closed Won": 1.00, "Closed Lost": 0.00,
};

function getStageScore(stageName: string): number {
  for (const [key, val] of Object.entries(STAGE_WIN_RATE)) {
    if (stageName.toLowerCase().includes(key.toLowerCase())) return val;
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

function getProposalReadiness(data: SFData, activityScore: number): number {
  let score = 0;
  if (data.opportunity.Description) score += 20;
  score += Math.min(20, (data.contacts?.length || 0) * 5);
  score += Math.round(activityScore * 0.2);
  if ((data.opportunity.Amount ?? 0) > 0) score += 15;
  if (data.opportunity.CloseDate) score += 10;
  if (data.opportunity.NextStep) score += 10;
  if (data.account.Industry) score += 5;
  return Math.min(100, score);
}

export function analyzeData(data: SFData): Omit<AnalysisResult, "rationale"> {
  const stageScore = getStageScore(data.opportunity.StageName || "");
  const activityScore = getActivityScore(data.activities);
  const contactBonus = Math.min(0.10, data.contacts.length * 0.02);
  const activityBonus = (activityScore / 100) * 0.15;
  const sfProbWeight = ((data.opportunity.Probability ?? 0) / 100) * 0.20;
  const winProbability = Math.min(0.95, stageScore * 0.60 + sfProbWeight + activityBonus + contactBonus);
  const dealHealthScore = Math.min(100, Math.round(
    stageScore * 30 + (activityScore / 100) * 25 + Math.min(25, data.contacts.length * 5) + ((data.opportunity.Probability ?? 0) / 100) * 20,
  ));
  const total = activityScore * 0.7 + data.contacts.length * 3;
  const engagementLevel = total >= 70 ? "高" : total >= 40 ? "中" : "低";
  const proposalReadiness = getProposalReadiness(data, activityScore);
  const amount = data.opportunity.Amount || 0;
  const daysUntilClose = getDaysUntilClose(data.opportunity.CloseDate || "");
  const dealAge = getDealAgeInDays(data.opportunity.CreatedDate || "");
  const opp = data.opportunity;

  const scenarios = {
    optimistic: {
      label: "楽観シナリオ", probability: Math.min(0.95, winProbability + 0.20),
      expectedRevenue: amount * 1.10,
      timeline: daysUntilClose > 0 ? `${Math.max(7, daysUntilClose - 14)}日以内` : "即時クローズ可能",
      conditions: ["意思決定者との直接面談を早期実施", "競合他社より先行して提案書提出", "追加割引または特典の提供", "経営層のスポンサー獲得"],
    },
    base: {
      label: "標準シナリオ", probability: winProbability, expectedRevenue: amount,
      timeline: daysUntilClose > 0 ? `${daysUntilClose}日` : "要再設定",
      conditions: ["現在のエンゲージメント水準を維持", "クローズ予定日どおりに進捗", "既存の要件・予算での合意"],
    },
    pessimistic: {
      label: "悲観シナリオ", probability: Math.max(0.05, winProbability - 0.25),
      expectedRevenue: amount * 0.75, timeline: `${daysUntilClose + 30}日以上`,
      conditions: ["予算削減・凍結リスク", "競合案件との比較検討長期化", "意思決定プロセスの複雑化", "スコープ縮小での再提案が必要"],
    },
  };

  const keyDrivers: string[] = [];
  if ((opp.Amount ?? 0) > 1000000) keyDrivers.push("大型案件（高い戦略的優先度）");
  if ((opp.Probability ?? 0) >= 60) keyDrivers.push(`商談確度${opp.Probability}%（高確度）`);
  if (data.activities.length >= 5) keyDrivers.push(`活発な商談活動（直近${data.activities.length}件のアクティビティ）`);
  if (data.contacts.length >= 3) keyDrivers.push(`複数のキーパーソンとの関係構築済み（${data.contacts.length}名）`);
  if (opp.LeadSource) keyDrivers.push(`${opp.LeadSource}経由のリード（信頼性の高いソース）`);
  if (data.account.Industry) keyDrivers.push(`${data.account.Industry}業界への深い知見`);
  if (opp.NextStep) keyDrivers.push("明確なネクストステップ設定済み");
  if (keyDrivers.length < 3) keyDrivers.push("既存顧客との信頼関係", "製品適合性の高い要件");

  const riskFactors: string[] = [];
  if (daysUntilClose < 14 && daysUntilClose > 0) riskFactors.push("クローズ期限が迫っている（2週間以内）");
  if (daysUntilClose < 0) riskFactors.push("クローズ予定日超過（再スケジューリング必要）");
  if (dealAge > 180) riskFactors.push("商談長期化（6ヶ月超）による失注リスク");
  if (data.activities.length < 3) riskFactors.push("アクティビティ不足（エンゲージメント低下の兆候）");
  if ((opp.Probability ?? 0) < 30) riskFactors.push(`商談確度低（${opp.Probability}%）`);
  if (!opp.NextStep) riskFactors.push("ネクストステップ未設定（商談進捗が不明確）");
  if (data.contacts.length < 2) riskFactors.push("コンタクト不足（意思決定者へのアクセス限定的）");
  if (riskFactors.length < 2) riskFactors.push("競合他社の存在", "予算承認プロセスの不明確さ");

  const recommendedActions: string[] = [];
  if (daysUntilClose < 30) recommendedActions.push("緊急：今週中にエグゼクティブスポンサーとのミーティングを設定");
  if (!opp.NextStep) recommendedActions.push("ネクストステップを具体的なアクションと日程で再設定");
  if (data.contacts.length < 3) recommendedActions.push("追加キーパーソン（IT・財務・調達部門）の特定とアプローチ");
  if (data.activities.length < 5) recommendedActions.push("商談活性化のためデモ・ワークショップの実施を提案");
  if (winProbability < 0.5) recommendedActions.push("競合差別化ポイントを強調したカスタム提案書を再作成");
  recommendedActions.push("ROIシミュレーション資料を用いた経営判断サポート");
  recommendedActions.push("パイロット案件での早期導入効果実証を提案");

  return {
    winProbability: Math.round(winProbability * 100), dealHealthScore, activityScore: Math.round(activityScore),
    engagementLevel, proposalReadiness, scenarios,
    keyDrivers: keyDrivers.slice(0, 5),
    riskFactors: riskFactors.slice(0, 5),
    recommendedActions: recommendedActions.slice(0, 5),
  };
}
