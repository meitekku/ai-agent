import { generateText } from "ai";
import { getSlideModel } from "@/lib/slide-provider";
import {
  SLIDE_HTML_SYSTEM_PROMPT,
  buildRenderPrompt,
  extractHtmlFromResponse,
  getSlideHtmlValidationIssue,
  isValidSlideHtml,
  extractDisplayTexts,
  generateFallbackHtml,
  shouldRetryInvalidSlideHtml,
  type StyleOptions,
} from "@/lib/slide-prompts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      slidePlanSection: string;
      slideTitle: string;
      slideIndex: number;
      totalSlides: number;
      deckTitle: string;
      slideType: string;
      styleOptions?: StyleOptions;
      backend?: "ollama" | "gemini" | "mlx";
    };

    const {
      slidePlanSection,
      slideTitle,
      slideIndex,
      totalSlides,
      deckTitle,
      slideType,
      styleOptions,
    } = body;

    if (!slidePlanSection || slideTitle === undefined) {
      return Response.json(
        { error: "slidePlanSection and slideTitle are required" },
        { status: 400 },
      );
    }

    const model = getSlideModel();
    const prompt = buildRenderPrompt(
      slidePlanSection,
      slideTitle,
      slideIndex,
      totalSlides,
      deckTitle,
      slideType,
      styleOptions,
    );

    let html: string;
    let fallback = false;
    const textElements = extractDisplayTexts(slidePlanSection);

    const generateHtml = async (retry = false) => {
      const result = await generateText({
        model,
        system: SLIDE_HTML_SYSTEM_PROMPT,
        prompt: retry
          ? `${prompt}\n\n【再出力指示】\n前回のHTMLは途中で切れたか、閉じタグが不足して無効でした。要素数を減らしてよいので、必ず完全に閉じた単一の<div>のみを返してください。最後は必ず </div> で終えてください。`
          : prompt,
        temperature: 0.2,
        maxOutputTokens: 4000,
      });

      return extractHtmlFromResponse(result.text);
    };

    try {
      html = await generateHtml();

      if (!isValidSlideHtml(html) && shouldRetryInvalidSlideHtml(html)) {
        const issue = getSlideHtmlValidationIssue(html);
        console.warn(
          `[slides/render] Invalid HTML for slide ${slideIndex + 1} (${issue}), retrying once`,
        );
        html = await generateHtml(true);
      }

      if (!isValidSlideHtml(html)) {
        const issue = getSlideHtmlValidationIssue(html);
        console.warn(
          `[slides/render] Invalid HTML for slide ${slideIndex + 1} (${issue}), using fallback`,
        );
        html = generateFallbackHtml(
          slideTitle,
          slideType,
          textElements,
          deckTitle,
        );
        fallback = true;
      }
    } catch (err) {
      console.error(
        `[slides/render] LLM error for slide ${slideIndex + 1}:`,
        err,
      );
      html = generateFallbackHtml(
        slideTitle,
        slideType,
        textElements,
        deckTitle,
      );
      fallback = true;
    }

    return Response.json({ html, fallback });
  } catch (err) {
    console.error("[slides/render] Unexpected error:", err);
    return Response.json({ error: "Failed to render slide" }, { status: 500 });
  }
}
