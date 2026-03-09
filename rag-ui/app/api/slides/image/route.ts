import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { GEMINI_API_KEY } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

const IMAGE_MODEL = "gemini-2.5-flash-preview-05-20";

export async function POST(req: Request) {
  try {
    if (!GEMINI_API_KEY) {
      return Response.json(
        { error: "Image generation requires GEMINI_API_KEY" },
        { status: 503 },
      );
    }

    const body = await req.json();
    const prompt = (body.prompt || "").trim();
    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const gemini = createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY });

    const result = await generateText({
      model: gemini(IMAGE_MODEL),
      providerOptions: {
        google: { responseModalities: ["TEXT", "IMAGE"] },
      },
      prompt,
    });

    // Find the first image in result.files
    for (const file of result.files ?? []) {
      if (file.mediaType.startsWith("image/")) {
        const dataUrl = `data:${file.mediaType};base64,${file.base64}`;
        return Response.json({ data_url: dataUrl });
      }
    }

    return Response.json(
      { error: "No image generated — model returned text only" },
      { status: 500 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Image generation failed";
    console.error("[slides/image]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
