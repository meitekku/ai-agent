import { generateText } from "ai";
import { getChatModel, useGemini } from "@/lib/ollama-provider";
import { listDocuments } from "@/lib/rag-client";
import { upsertKbConfig } from "@/lib/kb-config-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const { documents } = await listDocuments();

    if (documents.length === 0) {
      await upsertKbConfig("", "");
      return Response.json({ title: "", description: "" });
    }

    const docNames = documents.map((d) => d.name).join("\n");

    const { text } = await generateText({
      model: getChatModel(),
      system: useGemini
        ? "You are a helpful assistant. Always respond with valid JSON only, no markdown."
        : "You are a helpful assistant. Always respond with valid JSON only, no markdown.\n\n/no_think",
      prompt: `以下はナレッジベースに登録されているドキュメント一覧です。これらのドキュメント名から、このナレッジベース全体のタイトルと概要を日本語で生成してください。

ドキュメント一覧:
${docNames}

以下の JSON 形式で出力してください:
{"title": "簡潔なタイトル（20文字以内）", "description": "内容の概要（100文字以内）"}

タイトル例：「社内規定集」「製品マニュアル」「研究論文集」
概要はナレッジベースに含まれる情報の種類を具体的に説明してください。`,
    });

    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[kb-config/generate] no JSON in response:", text);
      return Response.json({ error: "Failed to parse response" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { title: string; description: string };
    await upsertKbConfig(parsed.title, parsed.description);
    return Response.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kb-config/generate] error:", message, err);
    return Response.json({ error: message }, { status: 500 });
  }
}
