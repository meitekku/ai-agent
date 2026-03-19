import { Hono } from "hono";
import pptxgen from "pptxgenjs";
import { generateText } from "../lib/gemini";
import { buildPptxPrompt, buildSlideRevisionPrompt } from "../lib/prompts";
import { getPool } from "../lib/db";
import type { PresentationPlan, SlideDefinition, R } from "../lib/types";

const app = new Hono();

async function fetchTemplateContent(): Promise<string> {
  try {
    const pool = getPool();
    const result = await pool.query(
      "SELECT name, service_name, content_text FROM proposal_templates ORDER BY updated_at DESC LIMIT 8",
    );
    if (result.rows.length === 0) return "";

    const parts: string[] = [];
    for (const row of result.rows) {
      const serviceName = row.service_name || "（サービス未設定）";
      if (row.content_text) {
        parts.push(`### 【${serviceName}】 ${row.name}\n${row.content_text.slice(0, 3000)}`);
      } else {
        parts.push(`### 【${serviceName}】 ${row.name}\n[バイナリファイル — 構成・トーンを参考にしてください]`);
      }
    }

    return `\n\n## 既存の参考資料（提案書テンプレートまたはサービス紹介資料）
以下はサービス別の参考資料です。資料の種類に応じて以下のように活用してください：

### 資料活用ルール
- **提案書テンプレートの場合**: 構成・トーン・論理展開を参考にし、顧客固有の課題・データを組み込んで提案書に仕上げる
- **サービス紹介資料の場合**: サービスの特徴・機能・メリットを抽出し、顧客の課題解決にどう貢献するかの観点で提案書として再構成する
- いずれの場合も、最終出力は「顧客向けの説得力ある提案書」として作成すること

${parts.join("\n\n")}`;
  } catch {
    return "";
  }
}

async function renderPPTX(plan: PresentationPlan, title: string): Promise<Buffer> {
  const pres = new pptxgen() as any;
  pres.layout = "LAYOUT_16x9";
  pres.author = "CRM Proposal Generator";
  pres.title = title;

  const totalSlides = plan.slides.length;
  const fontFace = "Calibri";
  const shadow = { type: "outer" as const, blur: 6, offset: 2, angle: 135, color: "000000", opacity: 0.10 };

  for (let si = 0; si < totalSlides; si++) {
    const sd = plan.slides[si];
    const slide = pres.addSlide();
    slide.background = { color: sd.bgColor || plan.theme.background };

    if (sd.layout !== "title" && sd.layout !== "closing") {
      slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.75, fill: { color: plan.theme.primary } });
      slide.addText(sd.title, { x: 0.4, y: 0, w: 7, h: 0.75, fontSize: 22, fontFace, bold: true, color: "FFFFFF", valign: "middle", margin: 0 });
      if (sd.subtitle) {
        slide.addText(sd.subtitle, { x: 0.4, y: 0.75, w: 9, h: 0.32, fontSize: 11, fontFace, color: plan.theme.lightText, italic: true, valign: "middle", margin: 0 });
      }
    }

    if (sd.layout !== "title") {
      slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.35, w: 10, h: 0.275, fill: { color: plan.theme.primary } });
      slide.addText(`Confidential | ${si + 1} / ${totalSlides}`, { x: 0, y: 5.35, w: 10, h: 0.275, fontSize: 9, fontFace, color: plan.theme.accent || "CADCFC", align: "right", valign: "middle", margin: [0, 0.3, 0, 0] });
    }

    for (const el of sd.elements) {
      const baseOpts = { x: el.x, y: el.y, w: el.w, h: el.h };

      switch (el.type) {
        case "text":
          slide.addText(String(el.content ?? ""), {
            ...baseOpts, fontSize: el.fontSize || 14, fontFace, bold: el.bold || false,
            italic: el.italic || false, color: el.color || plan.theme.text,
            align: el.align || "left", valign: el.valign || "top",
            margin: [0.1, 0.15, 0.1, 0.15],
            ...(el.fill ? { fill: { color: el.fill } } : {}),
          });
          break;

        case "shape":
          slide.addShape(pres.shapes.RECTANGLE, {
            ...baseOpts, fill: el.fill ? { color: el.fill } : undefined,
            line: el.borderColor ? { color: el.borderColor, width: 1 } : undefined, shadow,
          });
          break;

        case "list": {
          const items = el.items || [];
          const textItems = items.map((item, idx) => ({
            text: String(item ?? ""), options: { bullet: true, breakLine: idx < items.length - 1 },
          }));
          slide.addText(textItems, {
            ...baseOpts, fontSize: el.fontSize || 12, fontFace,
            color: el.color || plan.theme.text, valign: "top",
            margin: [0.1, 0.15, 0.1, 0.15],
          });
          break;
        }

        case "kpi":
          slide.addShape(pres.shapes.RECTANGLE, { ...baseOpts, fill: { color: el.fill || "FFFFFF" }, shadow });
          slide.addShape(pres.shapes.RECTANGLE, { x: el.x, y: el.y, w: el.w, h: 0.06, fill: { color: el.valueColor || plan.theme.accent } });
          slide.addText(String(el.value ?? ""), {
            x: el.x, y: el.y + 0.1, w: el.w, h: el.h * 0.55,
            fontSize: Math.min(36, Math.max(20, Math.round(el.h * 18))),
            fontFace, bold: true, color: el.valueColor || plan.theme.accent,
            align: "center", valign: "middle", margin: 0,
          });
          slide.addText(String(el.label ?? ""), {
            x: el.x, y: el.y + el.h * 0.6, w: el.w, h: el.h * 0.35,
            fontSize: 11, fontFace, color: plan.theme.lightText,
            align: "center", valign: "top", margin: 0,
          });
          break;

        case "table": {
          const rows = el.rows || [];
          if (rows.length === 0) break;
          const headerBg = el.headerBg || plan.theme.primary;
          const tableRows = rows.map((row, ri) =>
            row.map((cell) => ({
              text: String(cell ?? ""),
              options: {
                fontSize: ri === 0 ? 11 : 10, fontFace, bold: ri === 0,
                color: ri === 0 ? "FFFFFF" : plan.theme.text,
                fill: ri === 0 ? { color: headerBg } : ri % 2 === 0 ? { color: "F8F9FA" } : undefined,
                valign: "middle" as const, margin: [0.05, 0.1, 0.05, 0.1],
              },
            })),
          );
          slide.addTable(tableRows, {
            ...baseOpts, border: { pt: 0.5, color: "DEE2E6" },
            colW: Array(rows[0].length).fill(el.w / rows[0].length),
          });
          break;
        }
      }
    }
  }

  return (await pres.write({ outputType: "nodebuffer" })) as Buffer;
}

app.post("/proposal/generate-pptx", async (c) => {
  try {
    const { data, analysis, additionalContext } = await c.req.json();
    if (!data || !analysis) return c.json({ error: "データまたは分析結果が不足しています" }, 400);
    if (!process.env.GEMINI_API_KEY) return c.json({ error: "Gemini APIキーが設定されていません" }, 400);

    const templateContent = await fetchTemplateContent();
    const prompt = buildPptxPrompt(data, analysis, templateContent, additionalContext);
    const text = await generateText(prompt, 16000);
    let cleaned = text.replace(/```json|```/g, "").trim();
    let plan: PresentationPlan;
    try {
      plan = JSON.parse(cleaned);
    } catch {
      let openBrackets = 0, openBraces = 0;
      for (const ch of cleaned) {
        if (ch === "[") openBrackets++;
        else if (ch === "]") openBrackets--;
        else if (ch === "{") openBraces++;
        else if (ch === "}") openBraces--;
      }
      cleaned = cleaned.replace(/,\s*$/, "");
      cleaned += "]".repeat(Math.max(0, openBrackets)) + "}".repeat(Math.max(0, openBraces));
      plan = JSON.parse(cleaned);
    }

    const pptxTitle = `提案書 - ${data.opportunity?.Name || "商談"}`;
    const pptxBuffer = await renderPPTX(plan, pptxTitle);
    const fileName = encodeURIComponent(`提案書_${data.account?.Name || ""}_${data.opportunity?.Name || ""}.pptx`);

    return new Response(new Uint8Array(pptxBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
        "Content-Length": String(pptxBuffer.length),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    console.error("Generate PPTX Error:", err);
    return c.json({ error: `生成エラー: ${message}` }, 500);
  }
});

// --- New split endpoints ---

/** Generate plan JSON only (no PPTX rendering) */
app.post("/proposal/generate-plan", async (c) => {
  try {
    const { data, analysis, additionalContext } = await c.req.json();
    if (!data || !analysis) return c.json({ error: "データまたは分析結果が不足しています" }, 400);
    if (!process.env.GEMINI_API_KEY) return c.json({ error: "Gemini APIキーが設定されていません" }, 400);

    const templateContent = await fetchTemplateContent();
    const prompt = buildPptxPrompt(data, analysis, templateContent, additionalContext);
    const text = await generateText(prompt, 16000);
    let cleaned = text.replace(/```json|```/g, "").trim();
    // Attempt to repair truncated JSON: close unclosed brackets
    let plan: PresentationPlan;
    try {
      plan = JSON.parse(cleaned);
    } catch {
      // Try to salvage truncated JSON by closing open arrays/objects
      let openBrackets = 0;
      let openBraces = 0;
      for (const ch of cleaned) {
        if (ch === "[") openBrackets++;
        else if (ch === "]") openBrackets--;
        else if (ch === "{") openBraces++;
        else if (ch === "}") openBraces--;
      }
      // Remove trailing comma if present
      cleaned = cleaned.replace(/,\s*$/, "");
      cleaned += "]".repeat(Math.max(0, openBrackets)) + "}".repeat(Math.max(0, openBraces));
      plan = JSON.parse(cleaned);
    }

    return c.json({ plan });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    console.error("Generate Plan Error:", err);
    return c.json({ error: message }, 500);
  }
});

/** Render PPTX from plan JSON (no AI needed) */
app.post("/proposal/render-pptx", async (c) => {
  try {
    const { plan, title } = await c.req.json();
    if (!plan?.slides?.length) return c.json({ error: "plan が不足しています" }, 400);

    const pptxTitle = title || "提案書";
    const pptxBuffer = await renderPPTX(plan as PresentationPlan, pptxTitle);
    const fileName = encodeURIComponent(`${pptxTitle}.pptx`);

    return new Response(new Uint8Array(pptxBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
        "Content-Length": String(pptxBuffer.length),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    console.error("Render PPTX Error:", err);
    return c.json({ error: `Render エラー: ${message}` }, 500);
  }
});

/** Revise a single slide within a plan */
app.post("/proposal/revise-slide", async (c) => {
  try {
    const { plan, slideIndex, instruction } = await c.req.json();
    if (!plan?.slides?.length) return c.json({ error: "plan が不足しています" }, 400);
    if (typeof slideIndex !== "number" || slideIndex < 0 || slideIndex >= plan.slides.length) {
      return c.json({ error: `slideIndex が範囲外です (0-${plan.slides.length - 1})` }, 400);
    }
    if (!instruction) return c.json({ error: "instruction が必要です" }, 400);
    if (!process.env.GEMINI_API_KEY) return c.json({ error: "Gemini APIキーが設定されていません" }, 400);

    const prompt = buildSlideRevisionPrompt(plan as PresentationPlan, slideIndex, instruction);
    const text = await generateText(prompt, 3000);
    const revisedSlide = JSON.parse(text.replace(/```json|```/g, "").trim()) as SlideDefinition;

    return c.json({ slide: revisedSlide, slideIndex });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    console.error("Revise Slide Error:", err);
    return c.json({ error: `修正エラー: ${message}` }, 500);
  }
});

export default app;
