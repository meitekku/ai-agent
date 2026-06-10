import { Hono } from "hono";
import { z } from "zod";
import { analyzeData } from "../lib/scoring";
import { generateText } from "../lib/gemini";
import { buildRationalePrompt } from "../lib/prompts";
import type { AnalysisRationale, SFData, R, ProposalJudgment } from "../lib/types";

const app = new Hono();

const analyzeBodySchema = z.object({
  data: z.object({ opportunity: z.unknown() }).passthrough(),
  availableTemplateServices: z.array(z.string()).optional(),
  additionalContext: z.string().optional(),
  model: z.string().optional(),
}).passthrough();

async function generateRationale(data: SFData, availableTemplateServices: string[], additionalContext?: string, model?: string, scores?: { winProbability: number; dealHealthScore: number; proposalReadiness: number }): Promise<AnalysisRationale> {
  const fallback: AnalysisRationale = {
    customerChallenges: ["顧客課題の詳細分析にはより多くの情報が必要です"],
    serviceRecommendations: [
      { service: "DX開発サービス", relevance: "primary", reason: "業務プロセスのデジタル化支援", features: ["カスタム開発", "システム統合"] },
      { service: "AI RAG Agent", relevance: "secondary", reason: "社内ナレッジ活用・提案書自動生成", features: ["AI質問応答", "ドキュメント検索"] },
    ],
    combinedSolution: "DX開発で基盤を構築し、AI RAG Agentで知識活用を最適化するソリューションを提案します。",
    existingProposalHints: ["顧客の業界特性に合わせた提案", "ROI試算の提示"],
    proposalJudgment: "dx_development",
    proposalJudgmentReason: "AI分析の実行に失敗したため、デフォルトとしてDX新規開発を推薦します。",
  };

  try {
    const prompt = buildRationalePrompt(data, availableTemplateServices, additionalContext, scores);
    const text = await generateText(prompt, 4000, model);

    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      const judgment = ["existing_service", "dx_development", "not_proposable"].includes(parsed.proposalJudgment)
        ? (parsed.proposalJudgment as ProposalJudgment)
        : "dx_development";
      return {
        customerChallenges: parsed.customerChallenges || [],
        serviceRecommendations: (parsed.serviceRecommendations || []).map((s: R) => ({
          service: s.service || "", relevance: s.relevance || "optional",
          reason: s.reason || "", features: s.features || [],
        })),
        combinedSolution: parsed.combinedSolution || "",
        existingProposalHints: parsed.existingProposalHints || [],
        proposalJudgment: judgment,
        proposalJudgmentReason: parsed.proposalJudgmentReason || "",
        keyDrivers: Array.isArray(parsed.keyDrivers) ? parsed.keyDrivers : undefined,
        riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : undefined,
        recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : undefined,
      };
    } catch {
      console.error("[analyze] JSON parse failed, using fallback rationale");
      return fallback;
    }
  } catch (err) {
    console.error("[analyze] Gemini API failed, using fallback rationale:", err);
    return fallback;
  }
}

app.post("/deals/analyze", async (c) => {
  try {
    const raw = await c.req.json().catch(() => null);
    const parsed = analyzeBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "リクエストボディが不正です", details: parsed.error.issues }, 400);
    }
    const { data, availableTemplateServices, additionalContext, model } = parsed.data as unknown as {
      data: SFData; availableTemplateServices?: string[]; additionalContext?: string; model?: string;
    };
    if (!data?.opportunity) {
      console.error("[analyze] Missing opportunity. data keys:", data ? Object.keys(data) : "null");
      return c.json({ error: "商談データが不足しています" }, 400);
    }

    const analysis = analyzeData(data);
    const templateServices: string[] = Array.isArray(availableTemplateServices) ? availableTemplateServices : [];

    let rationale: AnalysisRationale;
    if (process.env.GEMINI_API_KEY) {
      const scores = { winProbability: analysis.winProbability, dealHealthScore: analysis.dealHealthScore, proposalReadiness: analysis.proposalReadiness };
      rationale = await generateRationale(data, templateServices, additionalContext, model, scores);
    } else {
      rationale = {
        customerChallenges: ["AI分析にはGemini APIキーが必要です"],
        serviceRecommendations: [],
        combinedSolution: "",
        existingProposalHints: [],
        proposalJudgment: "dx_development",
        proposalJudgmentReason: "APIキー未設定のため判定できません。",
      };
    }

    // AI-generated fields override algorithmic defaults
    if (rationale.keyDrivers?.length) analysis.keyDrivers = rationale.keyDrivers;
    if (rationale.riskFactors?.length) analysis.riskFactors = rationale.riskFactors;
    if (rationale.recommendedActions?.length) analysis.recommendedActions = rationale.recommendedActions;

    return c.json({ analysis: { ...analysis, rationale } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: `分析エラー: ${message}` }, 500);
  }
});

export default app;
