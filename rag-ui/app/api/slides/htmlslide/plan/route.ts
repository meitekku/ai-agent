import { generateText } from "ai";
import { getSlideModel } from "@/lib/slide-provider";
import {
  HTML_SLIDE_PLAN_SYSTEM_PROMPT,
  buildPlanPrompt,
  parsePlanMarkdown,
  generateFallbackPlan,
} from "@/lib/slide-prompts";
import type { StyleOptions } from "@/lib/slide-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      question,
      answer,
      max_slides = 12,
      style_options,
      instructions,
    } = body as {
      question: string;
      answer: string;
      max_slides?: number;
      style_options?: StyleOptions;
      instructions?: string | null;
      backend?: "ollama" | "gemini" | "mlx";
    };

    if (!question || !answer) {
      return Response.json(
        { error: "question and answer are required" },
        { status: 400 },
      );
    }

    const model = getSlideModel();
    const prompt = buildPlanPrompt(question, answer, max_slides, style_options, instructions);
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

      const parsed = parsePlanMarkdown(planMd);
      if (parsed.slides.length < 3) {
        planMd = generateFallbackPlan(
          question,
          answer,
          max_slides,
          style_options,
        );
        source = "fallback";
      }
    } catch (err) {
      console.error("[slides/htmlslide/plan] LLM error, using fallback:", err);
      planMd = generateFallbackPlan(
        question,
        answer,
        max_slides,
        style_options,
      );
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
    console.error("[slides/htmlslide/plan] Unexpected error:", err);
    return Response.json(
      { error: "Failed to generate slide plan" },
      { status: 500 },
    );
  }
}
