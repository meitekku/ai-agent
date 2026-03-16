import { Hono } from "hono";
import { generateText } from "../lib/gemini";
import { buildRevisionPrompt } from "../lib/prompts";
import type { AnalysisResult, AnalysisRationale, R } from "../lib/types";

const app = new Hono();

app.post("/deals/rationale", async (c) => {
  // Same as /deals/analyze rationale generation, but standalone
  return c.json({ error: "Use /deals/analyze instead" }, 400);
});

app.post("/deals/revise-rationale", async (c) => {
  try {
    const { currentRationale, currentAnalysis, feedback } = await c.req.json();

    if ((!currentRationale && !currentAnalysis) || !feedback?.trim()) {
      return c.json({ error: "フィードバック内容が必要です" }, 400);
    }

    if (!process.env.GEMINI_API_KEY) {
      return c.json({ error: "Gemini APIキーが設定されていません" }, 400);
    }

    const analysis: AnalysisResult = currentAnalysis || {
      winProbability: 0, dealHealthScore: 0, activityScore: 0,
      engagementLevel: "", proposalReadiness: 0,
      scenarios: {
        optimistic: { label: "", probability: 0, expectedRevenue: 0, timeline: "", conditions: [] },
        base: { label: "", probability: 0, expectedRevenue: 0, timeline: "", conditions: [] },
        pessimistic: { label: "", probability: 0, expectedRevenue: 0, timeline: "", conditions: [] },
      },
      keyDrivers: [], riskFactors: [], recommendedActions: [],
      rationale: currentRationale,
    };
    if (currentRationale && !analysis.rationale) {
      analysis.rationale = currentRationale;
    }

    const prompt = buildRevisionPrompt(analysis, feedback);
    const text = await generateText(prompt, 4000);

    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      const rationaleData = parsed.rationale || parsed;
      const analysisUpdates = parsed.analysisUpdates || null;

      const revised: AnalysisRationale = {
        customerChallenges: rationaleData.customerChallenges || [],
        serviceRecommendations: (rationaleData.serviceRecommendations || []).map((s: R) => ({
          service: s.service || "", relevance: s.relevance || "optional",
          reason: s.reason || "", features: s.features || [],
        })),
        combinedSolution: rationaleData.combinedSolution || "",
        existingProposalHints: rationaleData.existingProposalHints || [],
        proposalJudgment: rationaleData.proposalJudgment || analysis.rationale?.proposalJudgment || "dx_development",
        proposalJudgmentReason: rationaleData.proposalJudgmentReason || analysis.rationale?.proposalJudgmentReason || "",
      };

      const response: R = { rationale: revised };
      if (analysisUpdates) {
        const updates: R = {};
        if (analysisUpdates.winProbability != null) updates.winProbability = analysisUpdates.winProbability;
        if (analysisUpdates.dealHealthScore != null) updates.dealHealthScore = analysisUpdates.dealHealthScore;
        if (analysisUpdates.activityScore != null) updates.activityScore = analysisUpdates.activityScore;
        if (analysisUpdates.engagementLevel != null) updates.engagementLevel = analysisUpdates.engagementLevel;
        if (analysisUpdates.proposalReadiness != null) updates.proposalReadiness = analysisUpdates.proposalReadiness;
        if (analysisUpdates.keyDrivers) updates.keyDrivers = analysisUpdates.keyDrivers;
        if (analysisUpdates.riskFactors) updates.riskFactors = analysisUpdates.riskFactors;
        if (analysisUpdates.recommendedActions) updates.recommendedActions = analysisUpdates.recommendedActions;
        if (analysisUpdates.scenarios) updates.scenarios = analysisUpdates.scenarios;
        response.analysisUpdates = updates;
      }

      return c.json(response);
    } catch {
      return c.json({ error: "AIの回答をパースできませんでした。再度お試しください。" }, 500);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    console.error("Revise Rationale Error:", err);
    return c.json({ error: `修正エラー: ${message}` }, 500);
  }
});

export default app;
