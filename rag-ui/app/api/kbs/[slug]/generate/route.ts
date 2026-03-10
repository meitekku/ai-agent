import { generateText } from "ai";
import { getChatModel, useGemini } from "@/lib/ollama-provider";
import { listDocuments, updateKB } from "@/lib/rag-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { documents } = await listDocuments(slug);

    if (documents.length === 0) {
      await updateKB(slug, { title: "", description: "" });
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
      console.error("[kbs/generate] no JSON in response:", text);
      return Response.json(
        { error: "Failed to parse response" },
        { status: 500 },
      );
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      title: string;
      description: string;
    };
    await updateKB(slug, {
      title: parsed.title,
      description: parsed.description,
    });
    return Response.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kbs/generate] error:", message, err);
    return Response.json({ error: message }, { status: 500 });
  }
}
