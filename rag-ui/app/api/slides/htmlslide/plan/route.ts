import { generateText } from "ai";
import { getSlideModel } from "@/lib/slide-provider";
import {
  HTML_SLIDE_PLAN_SYSTEM_PROMPT,
  buildPlanPrompt,
  parsePlanMarkdown,
  generateFallbackPlan,
  calcMaxSlides,
} from "@/lib/slide-prompts";
import { getEnabledSkillSummaries, getSkillByName } from "@/lib/skills-db";
import type { StyleOptions } from "@/lib/slide-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      question,
      answer,
      max_slides,
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

    // Use calcMaxSlides() when not explicitly provided
    const maxSlides = max_slides ?? calcMaxSlides(answer);

    if (!question || !answer) {
      return Response.json(
        { error: "question and answer are required" },
        { status: 400 },
      );
    }

    const model = getSlideModel();

    // Progressive skill loading: summaries → AI selects → load full content
    let skillContext = "";
    try {
      const skills = await getEnabledSkillSummaries();
      if (skills.length > 0) {
        const summaryList = skills
          .map((s) => `- ${s.name}: ${s.description}`)
          .join("\n");

        // Step 1: AI selects relevant skills from summaries
        const selectionResult = await generateText({
          model,
          prompt: `以下はシステムに登録されたスキル一覧です。プレゼンテーション構成・スライド設計に役立つスキルを選んでください。

${summaryList}

関連するスキル名だけをJSON配列で返してください（例: ["skill-a", "skill-b"]）。該当なしなら [] を返してください。JSON以外は不要です。`,
          temperature: 0,
          maxOutputTokens: 200,
        });

        let selectedNames: string[] = [];
        try {
          const match = selectionResult.text.match(/\[[\s\S]*\]/);
          if (match) selectedNames = JSON.parse(match[0]);
        } catch {
          // Parse failed
        }

        // Step 2: Load full content of selected skills only
        if (selectedNames.length > 0) {
          const loaded = await Promise.all(
            selectedNames.slice(0, 5).map((n) => getSkillByName(n)),
          );
          const available = loaded.filter(Boolean) as NonNullable<(typeof loaded)[0]>[];
          if (available.length > 0) {
            const MAX_CHARS = 8000;
            let contentParts: string[] = [];
            let totalChars = 0;
            for (const s of available) {
              const part = `### ${s.name}\n${s.content}`;
              if (totalChars + part.length > MAX_CHARS) break;
              contentParts.push(part);
              totalChars += part.length;
            }
            skillContext = `\n\n## 参考スキル（AI が選択）\n以下のスキルのガイドラインに従ってスライドを構成してください。\n\n${contentParts.join("\n\n")}`;
          }
        }
      }
    } catch {
      // Skills not available — continue without them
    }

    let prompt = buildPlanPrompt(
      question,
      answer,
      maxSlides,
      style_options,
      instructions,
    );
    if (skillContext) prompt += skillContext;
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
          maxSlides,
          style_options,
        );
        source = "fallback";
      }
    } catch (err) {
      console.error("[slides/htmlslide/plan] LLM error, using fallback:", err);
      planMd = generateFallbackPlan(
        question,
        answer,
        maxSlides,
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
