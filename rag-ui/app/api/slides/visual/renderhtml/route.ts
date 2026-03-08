import { generateText } from "ai";
import { getSlideModel } from "@/lib/slide-provider";
import { STYLE_PRESETS, extractHtmlFromResponse, isValidSlideHtml } from "@/lib/slide-prompts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slide, style_preset = "corporate", deck_title, backend } = body;

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

    try {
      const result = await generateText({
        model,
        prompt,
        temperature: 0.2,
        maxOutputTokens: 3000,
      });

      const html = extractHtmlFromResponse(result.text);

      if (!isValidSlideHtml(html)) {
        console.warn(
          `[slides/visual/renderhtml] Invalid HTML for slide ${slide.slide_number}, returning fallback`,
        );
        return Response.json({ html: "", fallback: true });
      }

      return Response.json({ html, fallback: false });
    } catch (err) {
      console.error(`[slides/visual/renderhtml] LLM error:`, err);
      return Response.json({ html: "", fallback: true });
    }
  } catch (err) {
    console.error("[slides/visual/renderhtml] Unexpected error:", err);
    return Response.json({ error: "Failed to render slide" }, { status: 500 });
  }
}
