import { generateText } from "ai";
import { getChatModel, useGemini } from "@/lib/ollama-provider";
import { getConversation, updateConversation } from "@/lib/chat-db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const data = await getConversation(id);
    if (!data) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Extract first user message and first assistant reply
    const firstUser = data.messages.find((m) => m.role === "user");
    const firstAssistant = data.messages.find((m) => m.role === "assistant");

    if (!firstUser) {
      return Response.json({ error: "No user message" }, { status: 400 });
    }

    const userText = (firstUser.parts as { type: string; text?: string }[])
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .slice(0, 500);

    const assistantText = firstAssistant
      ? (firstAssistant.parts as { type: string; text?: string }[])
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join(" ")
          .slice(0, 300)
      : "";

    const prompt = assistantText
      ? `ユーザー: ${userText}\nAI: ${assistantText}\n\n上記の会話内容を元に、この会話の簡潔なタイトルを生成してください。\n\nルール:\n- 会話の言語と同じ言語で書く\n- 15文字以内（日本語）/ 50文字以内（英語）\n- 引用符や装飾なし、タイトルのテキストのみ出力`
      : `ユーザー: ${userText}\n\n上記のメッセージ内容を元に、この会話の簡潔なタイトルを生成してください。\n\nルール:\n- メッセージの言語と同じ言語で書く\n- 15文字以内（日本語）/ 50文字以内（英語）\n- 引用符や装飾なし、タイトルのテキストのみ出力`;

    const { text } = await generateText({
      model: getChatModel(),
      system: useGemini
        ? "You are a concise title generator. Output only the title text, nothing else."
        : "You are a concise title generator. Output only the title text, nothing else.\n\n/no_think",
      prompt,
      maxTokens: 60,
    });

    // Clean up: remove quotes, trim
    const title = text.replace(/^["'「『【]+|["'」』】]+$/g, "").trim();

    if (title) {
      await updateConversation(id, { title });
    }

    return Response.json({ title });
  } catch (err) {
    console.error("[generate-title] error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
