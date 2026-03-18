import { generateText } from "ai";
import { getSlideModel } from "@/lib/slide-provider";
import { STYLE_PRESETS } from "@/lib/slide-prompts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const OUTLINE_SYSTEM_PROMPT = `You are a presentation outline generator.
Given a question and answer, generate a JSON outline for a slide deck.

Output ONLY valid JSON with this structure:
{
  "title": "Deck title",
  "slides": [
    {
      "slide_number": 1,
      "title": "Slide title",
      "type": "cover",
      "key_message": "Main takeaway",
      "visual_description": "Description of visual elements",
      "layout": "center",
      "text_elements": ["Text line 1", "Text line 2"]
    }
  ]
}

Rules:
- First slide: type "cover"
- Last slide: type "back-cover"
- Middle slides: type "content"
- Each slide should have 2-5 text_elements with actual content (not descriptions)
- text_elements should be concise bullet points or key phrases
- Use Japanese for content
- 5-10 slides total based on content density
- Do NOT add information not present in the answer`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { question, answer, max_slides = 10 } = body;

    if (!question || !answer) {
      return Response.json(
        { error: "question and answer are required" },
        { status: 400 },
      );
    }

    const model = getSlideModel();

    const prompt = `質問: ${question}

回答:
${answer}

上記の内容をもとに、最大${max_slides}枚のスライド構成を生成してください。`;

    try {
      const result = await generateText({
        model,
        system: OUTLINE_SYSTEM_PROMPT,
        prompt,
        temperature: 0.3,
        maxOutputTokens: 4096,
      });

      // Extract JSON from response
      const text = result.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const outline = JSON.parse(jsonMatch[0]);

      // Build presets map for frontend
      const presets: Record<string, { label: string; description: string }> =
        {};
      for (const [key, val] of Object.entries(STYLE_PRESETS)) {
        presets[key] = { label: val.label, description: val.description };
      }
      // Add pptx-cards as a special preset
      presets["pptx-cards"] = {
        label: "PPTX Native",
        description: "Card-based, instant generation (no LLM)",
      };

      return Response.json({
        outline,
        presets,
        style_preset: "corporate",
      });
    } catch (err) {
      console.error("[slides/visual/outline] LLM error:", err);
      return Response.json(
        { error: "Failed to generate outline" },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error("[slides/visual/outline] Unexpected error:", err);
    return Response.json(
      { error: "Failed to generate outline" },
      { status: 500 },
    );
  }
}
