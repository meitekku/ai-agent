import { generateText } from "ai";
import { getSlideModel } from "@/lib/slide-provider";
import {
  SLIDE_HTML_SYSTEM_PROMPT,
  buildRenderPrompt,
  extractHtmlFromResponse,
  isValidSlideHtml,
  extractDisplayTexts,
  generateFallbackHtml,
} from "@/lib/slide-prompts";
import type { StyleOptions } from "@/lib/slide-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      slide_plan_section,
      slide_title,
      slide_index,
      total_slides,
      deck_title,
      slide_type,
      style_options,
      template_html,
      backend,
    } = body as {
      slide_plan_section: string;
      slide_title: string;
      slide_index: number;
      total_slides: number;
      deck_title: string;
      slide_type: string;
      style_options?: StyleOptions;
      template_html?: string;
      backend?: "ollama" | "gemini" | "mlx";
    };

    if (!slide_plan_section || slide_title === undefined) {
      return Response.json(
        { error: "slide_plan_section and slide_title are required" },
        { status: 400 },
      );
    }

    const model = getSlideModel();

    // Build prompt, optionally include template reference
    let prompt = buildRenderPrompt(
      slide_plan_section,
      slide_title,
      slide_index,
      total_slides,
      deck_title,
      slide_type,
      style_options,
    );

    if (template_html) {
      prompt += `\n\n【テンプレート参考】\n以下のHTMLテンプレートのスタイル（色・レイアウト・フォント）を参考にしてください：\n${template_html.slice(0, 2000)}`;
    }

    let html: string;
    let fallback = false;

    try {
      const result = await generateText({
        model,
        system: SLIDE_HTML_SYSTEM_PROMPT,
        prompt,
        temperature: 0.2,
        maxOutputTokens: 3000,
      });

      html = extractHtmlFromResponse(result.text);

      if (!isValidSlideHtml(html)) {
        const textElements = extractDisplayTexts(slide_plan_section);
        html = generateFallbackHtml(slide_title, slide_type, textElements, deck_title);
        fallback = true;
      }
    } catch (err) {
      console.error(`[slides/htmlslide/render] LLM error for slide ${slide_index + 1}:`, err);
      const textElements = extractDisplayTexts(slide_plan_section);
      html = generateFallbackHtml(slide_title, slide_type, textElements, deck_title);
      fallback = true;
    }

    return Response.json({ html, fallback });
  } catch (err) {
    console.error("[slides/htmlslide/render] Unexpected error:", err);
    return Response.json({ error: "Failed to render slide" }, { status: 500 });
  }
}
