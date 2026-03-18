import { generateText } from "ai";
import { getSlideModel } from "@/lib/slide-provider";
import {
  STYLE_PRESETS,
  extractHtmlFromResponse,
  getSlideHtmlValidationIssue,
  generateFallbackHtml,
  isValidSlideHtml,
  shouldRetryInvalidSlideHtml,
} from "@/lib/slide-prompts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slide, style_preset = "corporate", deck_title } = body;
    const fallbackHtml = generateFallbackHtml(
      slide?.title || "スライド",
      slide?.type || "content",
      Array.isArray(slide?.text_elements) ? slide.text_elements : [],
      deck_title || "Slides",
    );

    if (!slide) {
      return Response.json({ error: "slide is required" }, { status: 400 });
    }

    // PPTX Native preset: return skip signal (frontend generates locally)
    if (style_preset === "pptx-cards") {
      return Response.json({ html: "", skip: true });
    }

    const preset = STYLE_PRESETS[style_preset] || STYLE_PRESETS.corporate;
    const model = getSlideModel();

    const prompt = `Generate a single presentation slide as HTML.

Deck title: ${deck_title}
Slide ${slide.slide_number}: ${slide.title}
Type: ${slide.type}
Key message: ${slide.key_message}
Visual description: ${slide.visual_description}
Layout: ${slide.layout}
Text elements:
${(slide.text_elements || []).map((t: string) => `- ${t}`).join("\n")}

Style: ${preset.label}
- Texture: ${preset.texture}
- Mood: ${preset.mood}
- Typography: ${preset.typography}
- Density: ${preset.density}

Output ONLY a single <div> element with width:1280px, height:720px.
Use inline styles. Make text elements have data-editable="true".
Use Japanese text. No external images (inline SVG ok).
Font: 'Noto Sans JP', 'Inter', sans-serif.`;

    const generateHtml = async (retry = false) => {
      const result = await generateText({
        model,
        prompt: retry
          ? `${prompt}\n\nRetry instruction: The previous HTML was truncated or structurally invalid. Return a simpler but fully closed single <div> only, and end with </div>.`
          : prompt,
        temperature: 0.2,
        maxOutputTokens: 4000,
      });

      return extractHtmlFromResponse(result.text);
    };

    try {
      let html = await generateHtml();

      if (!isValidSlideHtml(html) && shouldRetryInvalidSlideHtml(html)) {
        const issue = getSlideHtmlValidationIssue(html);
        console.warn(
          `[slides/visual/renderhtml] Invalid HTML for slide ${slide.slide_number} (${issue}), retrying once`,
        );
        html = await generateHtml(true);
      }

      if (!isValidSlideHtml(html)) {
        const issue = getSlideHtmlValidationIssue(html);
        console.warn(
          `[slides/visual/renderhtml] Invalid HTML for slide ${slide.slide_number} (${issue}), returning fallback`,
        );
        return Response.json({ html: fallbackHtml, fallback: true });
      }

      return Response.json({ html, fallback: false });
    } catch (err) {
      console.error(`[slides/visual/renderhtml] LLM error:`, err);
      return Response.json({ html: fallbackHtml, fallback: true });
    }
  } catch (err) {
    console.error("[slides/visual/renderhtml] Unexpected error:", err);
    return Response.json({ error: "Failed to render slide" }, { status: 500 });
  }
}
