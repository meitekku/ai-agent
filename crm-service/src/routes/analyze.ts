import { Hono } from "hono";
import { analyzeData } from "../lib/scoring";
import { generateText } from "../lib/gemini";
import { buildRationalePrompt } from "../lib/prompts";
import type { AnalysisRationale, R, ProposalJudgment } from "../lib/types";

const app = new Hono();

async function generateRationale(data: R, availableTemplateServices: string[], additionalContext?: string, model?: string): Promise<AnalysisRationale> {
  const prompt = buildRationalePrompt(data, availableTemplateServices, additionalContext);
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
    };
  } catch {
    return {
      customerChallenges: ["顧客課題の詳細分析にはより多くの情報が必要です"],
      serviceRecommendations: [
        { service: "DX開発サービス", relevance: "primary", reason: "業務プロセスのデジタル化支援", features: ["カスタム開発", "システム統合"] },
        { service: "AI RAG Agent", relevance: "secondary", reason: "社内ナレッジ活用・提案書自動生成", features: ["AI質問応答", "ドキュメント検索"] },
      ],
      combinedSolution: "DX開発で基盤を構築し、AI RAG Agentで知識活用を最適化するソリューションを提案します。",
      existingProposalHints: ["顧客の業界特性に合わせた提案", "ROI試算の提示"],
      proposalJudgment: "dx_development",
      proposalJudgmentReason: "AI分析結果の解析に失敗したため、デフォルトとしてDX新規開発を推薦します。",
    };
  }
}

app.post("/deals/analyze", async (c) => {
  try {
    const { data, availableTemplateServices, additionalContext, model } = await c.req.json();
    if (!data?.opportunity) {
      return c.json({ error: "商談データが不足しています" }, 400);
    }

    const analysis = analyzeData(data);
    const templateServices: string[] = Array.isArray(availableTemplateServices) ? availableTemplateServices : [];

    let rationale: AnalysisRationale;
    if (process.env.GEMINI_API_KEY) {
      rationale = await generateRationale(data, templateServices, additionalContext, model);
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

    return c.json({ analysis: { ...analysis, rationale } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: `分析エラー: ${message}` }, 500);
  }
});

export default app;
