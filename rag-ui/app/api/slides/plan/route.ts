import { generateText } from "ai";
import { getSlideModel } from "@/lib/slide-provider";
import {
  HTML_SLIDE_PLAN_SYSTEM_PROMPT,
  buildPlanPrompt,
  parsePlanMarkdown,
  generateFallbackPlan,
  type StyleOptions,
} from "@/lib/slide-prompts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      question: string;
      answer: string;
      maxSlides?: number;
      styleOptions?: StyleOptions;
      backend?: "ollama" | "gemini" | "mlx";
    };

    const { question, answer, maxSlides = 12, styleOptions, backend } = body;

    if (!question || !answer) {
      return Response.json({ error: "question and answer are required" }, { status: 400 });
    }

    const model = getSlideModel();
    const prompt = buildPlanPrompt(question, answer, maxSlides, styleOptions);
    const startTime = Date.now();

    let planMd: string;
    let source: "llm" | "fallback" = "llm";

    try {
      const result = await generateText({
        model,
        system: HTML_SLIDE_PLAN_SYSTEM_PROMPT,
        prompt,
        temperature: 0.3,
        maxOutputTokens: 4096,
      });

      planMd = result.text.trim();

      // Validate: must have at least 3 slides
      const parsed = parsePlanMarkdown(planMd);
      if (parsed.slides.length < 3) {
        console.warn(
          `[slides/plan] LLM plan too short (${parsed.slides.length} slides), using fallback`,
        );
        planMd = generateFallbackPlan(question, answer, maxSlides, styleOptions);
        source = "fallback";
      }
    } catch (err) {
      console.error("[slides/plan] LLM error, using fallback:", err);
      planMd = generateFallbackPlan(question, answer, maxSlides, styleOptions);
      source = "fallback";
    }

    const { deckTitle, slides } = parsePlanMarkdown(planMd);

    return Response.json({
      planMd,
      deckTitle,
      slides,
      source,
      generationTimeMs: Date.now() - startTime,
    });
  } catch (err) {
    console.error("[slides/plan] Unexpected error:", err);
    return Response.json({ error: "Failed to generate slide plan" }, { status: 500 });
  }
}
