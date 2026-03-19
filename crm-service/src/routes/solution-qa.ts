import { Hono } from "hono";
import { generateChat } from "../lib/gemini";
import { SOLUTION_QA_SYSTEM_PROMPT } from "../lib/prompts";
import type { R } from "../lib/types";

const app = new Hono();

function buildContextPrompt(sfData: R | null, dealInput: R | null): string {
  const parts: string[] = [];
  if (sfData) {
    parts.push("## 既存CRMデータ");
    if (sfData.account?.Name) {
      parts.push(`### 顧客情報\n- 会社名: ${sfData.account.Name}\n- 業界: ${sfData.account.Industry || "未設定"}\n- 年商: ${sfData.account.AnnualRevenue || "未設定"}\n- 従業員数: ${sfData.account.NumberOfEmployees || "未設定"}`);
    }
    if (sfData.opportunity?.Name) {
      parts.push(`### 商談情報\n- 商談名: ${sfData.opportunity.Name}\n- 金額: ${sfData.opportunity.Amount || 0}\n- ステージ: ${sfData.opportunity.StageName || ""}\n- 確度: ${sfData.opportunity.Probability || 0}%\n- 説明: ${sfData.opportunity.Description || "なし"}`);
    }
    if (sfData.activities?.length > 0) {
      parts.push(`### 活動記録（${sfData.activities.length}件）\n${sfData.activities.slice(0, 10).map((a: R) => `- [${a.ActivityDate || ""}] ${a.Subject || ""}`).join("\n")}`);
    }
    if (sfData.contacts?.length > 0) {
      parts.push(`### 関係者（${sfData.contacts.length}名）\n${sfData.contacts.slice(0, 5).map((c: R) => `- ${c.LastName || ""}${c.FirstName || ""}（${c.Title || "役職不明"}）`).join("\n")}`);
    }
  }
  if (dealInput) {
    parts.push("## 新規商談情報");
    if (dealInput.customerName) parts.push(`- 顧客名: ${dealInput.customerName}`);
    if (dealInput.industry) parts.push(`- 業界: ${dealInput.industry}`);
    if (dealInput.challenge) parts.push(`- 課題: ${dealInput.challenge}`);
    if (dealInput.budget) parts.push(`- 予算: ${dealInput.budget}`);
    if (dealInput.timeline) parts.push(`- 期限: ${dealInput.timeline}`);
    if (dealInput.description) parts.push(`- 詳細:\n${dealInput.description}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : "";
}

app.post("/deals/solution-qa", async (c) => {
  try {
    const { messages, sfData, dealInput, model } = await c.req.json();
    if (!messages || messages.length === 0) {
      return c.json({ error: "メッセージが必要です" }, 400);
    }
    if (!process.env.GEMINI_API_KEY) {
      return c.json({ error: "Gemini APIキーが設定されていません" }, 400);
    }

    const contextPrompt = buildContextPrompt(sfData || null, dealInput || null);
    const systemMsg = SOLUTION_QA_SYSTEM_PROMPT + (contextPrompt ? `\n\n${contextPrompt}` : "");
    const reply = await generateChat(systemMsg, messages, 4000, model);
    return c.json({ reply });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    console.error("Solution QA Error:", err);
    return c.json({ error: `回答生成エラー: ${message}` }, 500);
  }
});

export default app;
