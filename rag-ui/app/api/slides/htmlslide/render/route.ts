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
} from "@/lib/slide-prompts";
import { getEnabledSkillSummaries, getSkillByName } from "@/lib/skills-db";
import type { StyleOptions } from "@/lib/slide-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cache skill content for the lifetime of the server (avoid DB hit per slide)
let _cachedSkillContext: string | null = null;
let _cachedSkillTime = 0;
const SKILL_CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getSkillContext(): Promise<string> {
  if (_cachedSkillContext !== null && Date.now() - _cachedSkillTime < SKILL_CACHE_TTL) {
    return _cachedSkillContext;
  }
  try {
    const skills = await getEnabledSkillSummaries();
    const slideSkills = skills.filter(
      (s) =>
        /スライド|提案|プレゼン|slide|proposal|present/i.test(s.name) ||
        /スライド|提案|プレゼン|slide|proposal|present/i.test(s.description),
    );
    if (slideSkills.length > 0) {
      const loaded = await Promise.all(
        slideSkills.slice(0, 3).map((s) => getSkillByName(s.name)),
      );
      const contents = loaded
        .filter(Boolean)
        .map((s) => `### ${s!.name}\n${s!.content}`)
        .join("\n\n");
      if (contents) {
        _cachedSkillContext = `\n\n## 参考スキル（スライドデザインガイドライン）\n${contents}`;
        _cachedSkillTime = Date.now();
        return _cachedSkillContext;
      }
    }
  } catch {
    // Skills not available
  }
  _cachedSkillContext = "";
  _cachedSkillTime = Date.now();
  return "";
}

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
    const skillContext = await getSkillContext();

    // Build prompt, optionally include template reference + skills
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

    if (skillContext) {
      prompt += skillContext;
    }

    let html: string;
    let fallback = false;
    const textElements = extractDisplayTexts(slide_plan_section);

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
          `[slides/htmlslide/render] Invalid HTML for slide ${slide_index + 1} (${issue}), retrying once`,
        );
        html = await generateHtml(true);
      }

      if (!isValidSlideHtml(html)) {
        const issue = getSlideHtmlValidationIssue(html);
        console.warn(
          `[slides/htmlslide/render] Invalid HTML for slide ${slide_index + 1} (${issue}), using fallback`,
        );
        html = generateFallbackHtml(
          slide_title,
          slide_type,
          textElements,
          deck_title,
        );
        fallback = true;
      }
    } catch (err) {
      console.error(
        `[slides/htmlslide/render] LLM error for slide ${slide_index + 1}:`,
        err,
      );
      html = generateFallbackHtml(
        slide_title,
        slide_type,
        textElements,
        deck_title,
      );
      fallback = true;
    }

    return Response.json({ html, fallback });
  } catch (err) {
    console.error("[slides/htmlslide/render] Unexpected error:", err);
    return Response.json({ error: "Failed to render slide" }, { status: 500 });
  }
}
