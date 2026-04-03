// ============================================================
// Slide Prompts & Utilities
// Ported from AIAgent's visual_slide_agent.py
// ============================================================

// --- Types ---

export type SlideSection = {
  title: string;
  type: "cover" | "content" | "back-cover";
  planText: string;
};

export type StyleOptions = {
  colorStyle?: string;
  font?: string;
  industry?: string;
  profession?: string;
  ageGroup?: string;
  customInstructions?: string;
};

export type ContentHint = "statistics" | "list" | "comparison" | "flow";

// --- Style Presets ---

export const STYLE_PRESETS: Record<
  string,
  {
    label: string;
    description: string;
    texture: string;
    mood: string;
    typography: string;
    density: string;
  }
> = {
  blueprint: {
    label: "Blueprint",
    description: "Technical grid, cool blue tones, monospace typography",
    texture: "grid paper with subtle technical blueprint lines",
    mood: "cool blue, professional, analytical",
    typography: "technical monospace, clean labels",
    density: "balanced, moderate whitespace",
  },
  corporate: {
    label: "Corporate",
    description: "Clean white, professional blue-gray, geometric sans-serif",
    texture: "clean white with subtle gradient accents",
    mood: "professional blue-gray, trustworthy, polished",
    typography: "geometric sans-serif, modern headings",
    density: "balanced, generous margins",
  },
  minimal: {
    label: "Minimal",
    description: "Flat white, neutral monochrome, geometric light",
    texture: "flat white, almost no texture",
    mood: "neutral monochrome, zen-like calm",
    typography: "geometric light weight, minimal labels",
    density: "minimal, lots of breathing room",
  },
  "sketch-notes": {
    label: "Sketch Notes",
    description: "Cream paper, warm earth tones, handwritten style",
    texture: "cream/beige paper with subtle grain",
    mood: "warm earth tones, approachable, creative",
    typography: "handwritten/marker style, informal labels",
    density: "balanced, organic placement",
  },
  "dark-atmospheric": {
    label: "Dark Atmospheric",
    description: "Deep dark, dramatic high-contrast, editorial serif",
    texture: "deep dark surface with subtle depth",
    mood: "dramatic, high-contrast, sophisticated",
    typography: "editorial serif headings, clean sans body",
    density: "balanced, dramatic spacing",
  },
  "bold-editorial": {
    label: "Bold Editorial",
    description: "Bold color blocks, vibrant saturated, large editorial",
    texture: "bold flat color blocks with sharp edges",
    mood: "vibrant, saturated, energetic",
    typography: "large editorial display type, impactful",
    density: "balanced, bold proportions",
  },
};

// --- System Prompts ---

export const HTML_SLIDE_PLAN_SYSTEM_PROMPT = `あなたはプレゼン構成の専門家です。
Markdown形式で各スライドの構成計画を出力してください。

【重要: 各スライドに必ず「表示テキスト」を含めること】
各スライドには、実際にスライド上に表示するテキスト項目を箇条書きで列挙してください。
曖昧な要約（例:「○○について説明」）ではなく、具体的な文言（例:「生産量: 年間5000トン」）を記述してください。

【出力形式】

# {プレゼンタイトル}

## スライド1: {タイトル}
- タイプ: cover
- 表示テキスト:
  - {メインタイトル}
  - 発表日: 20XX年XX月XX日
  - 発表者: ○○部
- デザイン: グラデーション背景（#1E3A5F → #2563EB）、大きな白文字タイポグラフィ
- レイアウト: 中央揃え

## スライド2: {タイトル}
- タイプ: content
- 表示テキスト:
  - {実際にスライドに載せる箇条書き1}
  - {実際にスライドに載せる箇条書き2}
  - {実際にスライドに載せる箇条書き3}
- レイアウト: icon-grid / split-screen / cards / timeline / comparison / data-chart
- デザイン: {具体的な色・背景・配置の指示}
- ビジュアル要素: {SVGアイコン / CSSテーブル / フローステップ / バーチャート等の具体的指示}

## スライドN: まとめ
- タイプ: back-cover
- 表示テキスト:
  - {要点1}
  - {要点2}
  - ご清聴ありがとうございました
- デザイン: グラデーション背景、中央揃え

【ルール】
1. coverは日本ビジネス慣習（日付・発表者欄を含める）
2. back-coverはまとめ要点+お礼
3. 「表示テキスト」には実際にスライド面に表示する具体的な文言を書く（曖昧な説明は不可）
4. 「デザイン」には具体的な色コード・レイアウト手法・背景スタイルを指定
5. 「ビジュアル要素」にはSVGアイコン・CSSテーブル・フロー図・バーチャート等の具体的技法を指定
6. 「レイアウト」は icon-grid / split-screen / cards / timeline / comparison / data-chart から選択
7. 枚数は内容に応じて自動決定（3〜15枚）。回答内容が豊富な場合は省略せず充分な枚数を確保する
8. 文書にない情報は推測しない
9. 数値データがある場合は必ずテーブルまたはチャートをビジュアル要素に指定
10. スタイル指定がある場合、色スタイル・フォント・対象層を全スライドの「デザイン」欄に必ず反映すること`;

export const SLIDE_HTML_SYSTEM_PROMPT = `あなたはプレゼンテーションスライドのHTMLデザイナーです。
1枚のスライドを表すHTMLを生成してください。Tailwind CSSが利用可能です。

【出力ルール】
1. <div>要素1つのみを出力（説明文やマークダウン不要）
2. ルートdivは class="w-[1280px] h-[720px] overflow-hidden" を使用
3. Tailwind CSSのユーティリティクラスを使用（インラインstyleは最小限に）
4. 外部画像URLは使用しない（SVGアイコンはインラインで可）
5. テキストは日本語でも英語でも読みやすいサイズ
6. テキスト要素には data-editable="true" 属性を付与
9. **<a>タグ（ハイパーリンク）は絶対に使用しない**。出典・参照は括弧書きのプレーンテキストで表記（例: （出典: 〇〇レポート 2025））。スライドはオフラインPPTX/PDFとしてエクスポートされるため、クリック可能なリンクは機能しない
7. font-family: 'Noto Sans JP', 'Inter', sans-serif（CDN読み込み済み）
8. すべてのタグを必ず閉じ、出力の最後はルートdivの閉じタグ </div> で終える

【利用可能なCDN】（ビューアが自動読み込み）
- Tailwind CSS v4 — 全ユーティリティクラス使用可能
- Google Fonts — 'Noto Sans JP'（日本語）、'Inter'（英語）
- Lucide Icons CDN — <i data-lucide="icon-name"></i> で使用可能

【Tailwind活用例】
- レイアウト: flex, grid, grid-cols-2, grid-cols-3, gap-4, items-center, justify-between
- 背景: bg-gradient-to-br, from-blue-900, to-blue-600, bg-white, bg-slate-50
- テキスト: text-4xl, text-2xl, text-lg, font-bold, text-white, text-slate-700, leading-relaxed
- カード: rounded-2xl, shadow-lg, border, border-slate-200, p-6, p-8
- 装飾: border-l-4, border-blue-500, divide-y, ring-2
- スペース: space-y-4, space-x-3, px-8, py-6, mt-4, mb-2

【Lucide Iconsの使い方】
- <i data-lucide="check-circle" class="w-6 h-6 text-green-500"></i>
- <i data-lucide="alert-triangle" class="w-6 h-6 text-yellow-500"></i>
- <i data-lucide="bar-chart-3" class="w-6 h-6 text-indigo-500"></i>
- <i data-lucide="lightbulb" class="w-6 h-6 text-amber-500"></i>
- <i data-lucide="arrow-right" class="w-5 h-5"></i>
- <i data-lucide="globe" class="w-8 h-8 text-blue-400"></i>
アイコン一覧: https://lucide.dev/icons （名前をkebab-caseで指定）

【デザイン指針】
- モダンでプロフェッショナルなデザイン
- アクセントカラーをデコレーションに活用
- 適切な余白とタイポグラフィ階層
- Tailwindのグラデーション、シャドウ、ボーダーで豊かな視覚表現

【テキストコントラスト（必須）】
- 白系・淡色背景: テキストは text-slate-800 以上の濃さ（text-gray-300/400/500 は禁止）
- 暗い背景: テキストは text-white または text-slate-100 を使用
- コントラスト比 4.5:1 以上を確保すること
- 薄いグレー文字（text-gray-400, text-slate-400 等）は装飾的な小さいラベルにのみ限定使用可

【コンテンツタイプ別ガイドライン】
- 統計データ: Tailwindで棒グラフ(w-[70%] h-6 bg-indigo-500 rounded)、大きな数値(text-5xl font-bold)
- 複数項目: grid grid-cols-2 gap-4 のカードレイアウト、各カードに rounded-xl shadow-md p-6
- フロー・手順: flex items-center gap-4 のステップ、rounded-full bg-blue-500 の番号丸
- 比較: grid grid-cols-2、各列でヘッダー色を変えて対比
- タイトル: text-5xl font-bold + bg-gradient-to-br + 装飾SVG/アイコン`;

// --- Content Hint Detection ---

export function detectContentHints(title: string, body: string): ContentHint[] {
  const hints: ContentHint[] = [];
  const combined = `${title} ${body || ""}`;

  // Statistics
  if (
    /\d+[%％]|\d+\.\d+|\d{2,}[万億千百]|増加|減少|成長|割合|平均|合計/.test(
      combined,
    )
  ) {
    hints.push("statistics");
  }

  // List (3+ bullet items)
  const listLines = (body || "").match(/^[\s]*[-・●▪▸*]\s/gm) || [];
  const numberedLines = (body || "").match(/^[\s]*\d+[.）)]\s/gm) || [];
  if (listLines.length >= 3 || numberedLines.length >= 3) {
    hints.push("list");
  }

  // Comparison
  if (
    /比較|対比|versus|vs\.?|に対して|一方|他方|それぞれ|メリット.*デメリット|長所.*短所|違い/i.test(
      combined,
    )
  ) {
    hints.push("comparison");
  }

  // Flow/process
  if (
    /手順|ステップ|フロー|流れ|工程|プロセス|順番|段階|step|phase|workflow/i.test(
      combined,
    )
  ) {
    hints.push("flow");
  }

  return hints;
}

// --- Plan Markdown Parser ---

export function parsePlanMarkdown(planMd: string): {
  deckTitle: string;
  slides: SlideSection[];
} {
  const lines = planMd.trim().split("\n");
  let deckTitle = "Slides";
  const slides: SlideSection[] = [];
  let currentSlide: SlideSection | null = null;

  for (const line of lines) {
    const stripped = line.trim();

    // Deck title: # ...
    if (/^#\s+/.test(stripped) && !/^##/.test(stripped)) {
      deckTitle = stripped.replace(/^#\s+/, "").trim();
      continue;
    }

    // Slide header: ## スライドN: ...
    const slideMatch = stripped.match(/^##\s+スライド\d+[:\s：]\s*(.+)/);
    if (slideMatch) {
      if (currentSlide) slides.push(currentSlide);
      currentSlide = {
        title: slideMatch[1].trim(),
        type: "content",
        planText: "",
      };
      continue;
    }

    // Fallback: any ## header
    if (/^##\s+/.test(stripped) && !slideMatch) {
      if (currentSlide) slides.push(currentSlide);
      const title = stripped.replace(/^##\s+/, "").trim();
      currentSlide = { title, type: "content", planText: "" };
      continue;
    }

    // Detect type
    if (currentSlide) {
      currentSlide.planText += line + "\n";
      const typeMatch = stripped.match(/^-\s*タイプ[:\s：]\s*(.+)/);
      if (typeMatch) {
        const rawType = typeMatch[1].trim().toLowerCase();
        if (rawType === "cover" || rawType === "back-cover") {
          currentSlide.type = rawType;
        } else if (rawType.includes("cover") && rawType.includes("back")) {
          currentSlide.type = "back-cover";
        } else if (rawType.includes("cover")) {
          currentSlide.type = "cover";
        }
      }
    }
  }

  if (currentSlide) slides.push(currentSlide);
  return { deckTitle, slides };
}

// --- Extract Display Texts from Plan ---

const PLAN_META_PATTERN =
  /^[-*]\s*(タイプ|レイアウト|デザイン|ビジュアル要素|表示テキスト|内容|type|layout|design)[:\s：]/i;

export function extractDisplayTexts(planText: string): string[] {
  const lines = planText.trim().split("\n");
  const texts: string[] = [];
  let inTextBlock = false;

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;

    if (PLAN_META_PATTERN.test(stripped)) {
      if (/^[-*]\s*(表示テキスト|内容)[:\s：]/.test(stripped)) {
        inTextBlock = true;
        const inline = stripped
          .replace(/^[-*]\s*(表示テキスト|内容)[:\s：]\s*/, "")
          .trim();
        if (inline) texts.push(inline);
      } else {
        inTextBlock = false;
      }
      continue;
    }

    if (inTextBlock && /^\s*[-*]\s+/.test(stripped)) {
      const item = stripped.replace(/^\s*[-*]\s+/, "").trim();
      if (item) texts.push(item);
    }
  }

  return texts;
}

// --- Extract Plan Field ---

function extractPlanField(planText: string, fieldName: string): string {
  for (const line of planText.trim().split("\n")) {
    const stripped = line.trim();
    const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = stripped.match(
      new RegExp(`^[-*]\\s*${escapedField}[:\\s：]\\s*(.+)`),
    );
    if (m) return m[1].trim();
  }
  return "";
}

// --- HTML Extraction from LLM Response ---

const ROOT_DIV_PATTERN = /<div[\s>]/i;
const VOID_HTML_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function findBalancedRootDivEnd(html: string): number {
  let depth = 0;
  let i = 0;

  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const commentEnd = html.indexOf("-->", i + 4);
      if (commentEnd === -1) return -1;
      i = commentEnd + 3;
      continue;
    }

    if (html[i] !== "<") {
      i += 1;
      continue;
    }

    let cursor = i + 1;
    let isClosingTag = false;

    if (html[cursor] === "/") {
      isClosingTag = true;
      cursor += 1;
    }

    while (cursor < html.length && /\s/.test(html[cursor])) {
      cursor += 1;
    }

    const tagNameStart = cursor;
    while (cursor < html.length && /[A-Za-z0-9:-]/.test(html[cursor])) {
      cursor += 1;
    }

    const tagName = html.slice(tagNameStart, cursor).toLowerCase();
    if (!tagName) {
      i += 1;
      continue;
    }

    let quote: '"' | "'" | null = null;
    while (cursor < html.length) {
      const ch = html[cursor];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      cursor += 1;
    }

    if (cursor >= html.length) return -1;

    const rawTag = html.slice(i, cursor + 1);
    const isSelfClosing = /\/\s*>$/.test(rawTag) || VOID_HTML_TAGS.has(tagName);

    if (tagName === "div") {
      if (isClosingTag) {
        depth -= 1;
        if (depth === 0) return cursor + 1;
        if (depth < 0) return -1;
      } else if (!isSelfClosing) {
        depth += 1;
      }
    }

    i = cursor + 1;
  }

  return -1;
}

export function extractHtmlFromResponse(text: string): string {
  let result = text.trim();

  // Try to extract from code fences
  const fenceMatch = result.match(/```(?:html)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    result = fenceMatch[1].trim();
  }

  // Ensure it starts with a <div
  const divMatch = result.match(/(<div[\s>][\s\S]*)/i);
  if (divMatch) {
    result = divMatch[1];
  }

  if (ROOT_DIV_PATTERN.test(result)) {
    const balancedEnd = findBalancedRootDivEnd(result);
    if (balancedEnd > 0) {
      result = result.slice(0, balancedEnd).trim();
    }
  }

  return result;
}

// --- HTML Validation ---

const HTML_QUALITY_REJECT_PATTERNS = [
  "レイアウト:",
  "レイアウト：",
  "デザイン:",
  "デザイン：",
  "ビジュアル要素:",
  "ビジュアル要素：",
  "表示テキスト:",
  "表示テキスト：",
  "タイプ: content",
  "タイプ: cover",
  "タイプ：",
];

function getVisibleSlideText(normalized: string) {
  return normalized
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getSlideHtmlValidationIssue(
  html: string,
):
  | "empty"
  | "missing-root-div"
  | "missing-styles"
  | "too-short"
  | "unbalanced-root-div"
  | "forbidden-tag"
  | "visible-text-too-short"
  | "meta-text-leak"
  | null {
  const normalized = extractHtmlFromResponse(html);
  if (!normalized?.trim()) return "empty";
  if (!ROOT_DIV_PATTERN.test(normalized)) return "missing-root-div";
  if (!normalized.includes("style=") && !normalized.includes("class=")) {
    return "missing-styles";
  }
  if (normalized.trim().length < 200) return "too-short";
  if (findBalancedRootDivEnd(normalized) !== normalized.length) {
    return "unbalanced-root-div";
  }
  if (/<(?:html|head|body|script|iframe)\b/i.test(normalized)) {
    return "forbidden-tag";
  }

  // Check reject patterns in visible text only
  const visibleText = getVisibleSlideText(normalized);
  if (visibleText.length < 4) return "visible-text-too-short";

  for (const pattern of HTML_QUALITY_REJECT_PATTERNS) {
    if (visibleText.includes(pattern)) return "meta-text-leak";
  }
  return null;
}

export function shouldRetryInvalidSlideHtml(html: string): boolean {
  const issue = getSlideHtmlValidationIssue(html);
  return issue === "too-short" || issue === "unbalanced-root-div";
}

export function isValidSlideHtml(html: string): boolean {
  return getSlideHtmlValidationIssue(html) === null;
}

// --- Build Plan Prompt ---

export function buildPlanPrompt(
  question: string,
  answer: string,
  maxSlides: number,
  styleOptions?: StyleOptions,
  instructions?: string | null,
): string {
  let styleInstruction = "";
  if (styleOptions) {
    const parts: string[] = [];
    if (styleOptions.industry)
      parts.push(
        `- 対象産業: ${styleOptions.industry}（この産業向けの語彙・事例・デザインテーマを使用）`,
      );
    if (styleOptions.profession)
      parts.push(
        `- 対象職種: ${styleOptions.profession}（この職種に適した専門性レベル・表現を使用）`,
      );
    if (styleOptions.ageGroup)
      parts.push(
        `- 対象年代層: ${styleOptions.ageGroup}（この年代層に響く表現・レイアウト・フォントサイズを選択）`,
      );
    if (styleOptions.colorStyle)
      parts.push(
        `- 色スタイル: ${styleOptions.colorStyle}（この色をメインカラーとして全スライドのデザイン指示に反映）`,
      );
    if (styleOptions.font)
      parts.push(
        `- フォント: ${styleOptions.font}（デザイン指示にこのフォントファミリーを指定）`,
      );
    if (styleOptions.customInstructions)
      parts.push(
        `- カスタム指示: ${styleOptions.customInstructions}`,
      );
    if (parts.length > 0)
      styleInstruction = `\n## スタイル指定（必ず全スライドに反映すること）\n${parts.join("\n")}\n`;
  }

  let instructionBlock = "";
  if (instructions) {
    instructionBlock = `\n## ユーザーの追加指示\n${instructions}\n`;
  }

  return `以下の情報をもとに、プレゼンテーションスライドの構成計画をMarkdown形式で作成してください。

## 質問
${question}

## 回答内容（これをスライドにまとめる）
${answer || "（なし）"}
${styleInstruction}${instructionBlock}
## 制約
- スライド枚数: 最大${maxSlides}枚（内容に応じて3〜${maxSlides}枚）
- 最初はcoverスライド（タイトル・日付・発表者欄）
- 最後はback-coverスライド（まとめ要点 + ご清聴ありがとうございました）
- 回答内容が充実している場合は、内容を省略せず十分な枚数のスライドを作成すること

## 重要
- 「表示テキスト」には、スライド面に実際に表示する具体的な文言を箇条書きで列挙すること
  （良い例: 「生産量: 年間5000トン」「主な生息地: 太平洋沿岸」）
  （悪い例: 「生態について説明する」「詳細を記載」）
- 各スライドのデザインに具体的な色コード・背景・レイアウト手法を含めること
- 数値やリストがある場合、ビジュアル要素にテーブル/チャート/カード等を指定すること`;
}

// --- Build Render Prompt ---

// Example HTML templates by content type
const COVER_EXAMPLE = `
■ 出力例（カバースライド）
<div style="width:1280px;height:720px;overflow:hidden;font-family:'Segoe UI','Hiragino Sans',sans-serif;position:relative;background:linear-gradient(135deg,#1E40AF 0%,#3B82F6 50%,#60A5FA 100%);">
  <div style="position:absolute;top:0;right:0;width:400px;height:400px;background:rgba(255,255,255,0.05);border-radius:50%;transform:translate(100px,-100px);"></div>
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;position:relative;z-index:1;">
    <div style="width:60px;height:4px;background:rgba(255,255,255,0.6);border-radius:2px;margin-bottom:32px;"></div>
    <h1 data-editable="true" style="font-size:48px;font-weight:700;color:#FFFFFF;margin:0 0 16px 0;line-height:1.3;max-width:900px;">プレゼンタイトル</h1>
    <p data-editable="true" style="font-size:20px;color:rgba(255,255,255,0.8);margin:0 0 40px 0;">サブタイトル</p>
    <div style="display:flex;gap:24px;align-items:center;color:rgba(255,255,255,0.7);font-size:14px;">
      <span data-editable="true">2026年</span>
      <span style="width:4px;height:4px;background:rgba(255,255,255,0.5);border-radius:50%;"></span>
      <span data-editable="true">発表者名</span>
    </div>
  </div>
</div>`;

const STATS_EXAMPLE = `
■ 出力例（テーブル・統計データ）
<div style="width:1280px;height:720px;overflow:hidden;font-family:'Segoe UI','Hiragino Sans',sans-serif;position:relative;background:#FFFFFF;">
  <div style="padding:48px 56px;position:relative;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px;">
      <div style="width:5px;height:36px;background:#3B82F6;border-radius:3px;"></div>
      <h2 data-editable="true" style="font-size:32px;font-weight:700;color:#1E293B;margin:0;">統計データ</h2>
    </div>
    <div style="border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;background:#1E40AF;">
        <div style="padding:14px 20px;color:#fff;font-weight:600;font-size:15px;">項目</div>
        <div style="padding:14px 20px;color:#fff;font-weight:600;font-size:15px;">数値</div>
        <div style="padding:14px 20px;color:#fff;font-weight:600;font-size:15px;">備考</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;background:#FFFFFF;">
        <div style="padding:12px 20px;font-size:14px;color:#1E293B;border-bottom:1px solid #F1F5F9;" data-editable="true">項目A</div>
        <div style="padding:12px 20px;font-size:14px;color:#3B82F6;font-weight:600;border-bottom:1px solid #F1F5F9;" data-editable="true">1,234</div>
        <div style="padding:12px 20px;font-size:14px;color:#64748B;border-bottom:1px solid #F1F5F9;" data-editable="true">前年比+12%</div>
      </div>
    </div>
  </div>
</div>`;

const FLOW_EXAMPLE = `
■ 出力例（フロー・プロセス図）
<div style="width:1280px;height:720px;overflow:hidden;font-family:'Segoe UI','Hiragino Sans',sans-serif;position:relative;background:#FFFFFF;">
  <div style="padding:48px 56px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:36px;">
      <div style="width:5px;height:36px;background:#3B82F6;border-radius:3px;"></div>
      <h2 data-editable="true" style="font-size:32px;font-weight:700;color:#1E293B;margin:0;">プロセスフロー</h2>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:32px;">
      <div style="display:flex;flex-direction:column;align-items:center;width:200px;">
        <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#3B82F6,#2563EB);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;">1</div>
        <h3 data-editable="true" style="font-size:16px;font-weight:600;color:#1E293B;margin:12px 0 4px 0;text-align:center;">ステップ1</h3>
        <p data-editable="true" style="font-size:13px;color:#64748B;text-align:center;margin:0;">説明文</p>
      </div>
      <svg width="40" height="24" viewBox="0 0 40 24" style="flex-shrink:0;"><path d="M0 12h30M24 6l6 6-6 6" fill="none" stroke="#CBD5E1" stroke-width="2"/></svg>
      <div style="display:flex;flex-direction:column;align-items:center;width:200px;">
        <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#3B82F6,#2563EB);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;">2</div>
        <h3 data-editable="true" style="font-size:16px;font-weight:600;color:#1E293B;margin:12px 0 4px 0;text-align:center;">ステップ2</h3>
        <p data-editable="true" style="font-size:13px;color:#64748B;text-align:center;margin:0;">説明文</p>
      </div>
      <svg width="40" height="24" viewBox="0 0 40 24" style="flex-shrink:0;"><path d="M0 12h30M24 6l6 6-6 6" fill="none" stroke="#CBD5E1" stroke-width="2"/></svg>
      <div style="display:flex;flex-direction:column;align-items:center;width:200px;">
        <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#10B981,#059669);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;">3</div>
        <h3 data-editable="true" style="font-size:16px;font-weight:600;color:#1E293B;margin:12px 0 4px 0;text-align:center;">完了</h3>
        <p data-editable="true" style="font-size:13px;color:#64748B;text-align:center;margin:0;">説明文</p>
      </div>
    </div>
  </div>
</div>`;

const COMPARISON_EXAMPLE = `
■ 出力例（比較レイアウト）
<div style="width:1280px;height:720px;overflow:hidden;font-family:'Segoe UI','Hiragino Sans',sans-serif;position:relative;background:#FFFFFF;">
  <div style="padding:48px 56px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px;">
      <div style="width:5px;height:36px;background:#3B82F6;border-radius:3px;"></div>
      <h2 data-editable="true" style="font-size:32px;font-weight:700;color:#1E293B;margin:0;">比較タイトル</h2>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
      <div style="background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-radius:16px;padding:28px;border-top:4px solid #3B82F6;">
        <h3 data-editable="true" style="font-size:22px;font-weight:700;color:#1E40AF;margin:0 0 16px 0;">カテゴリA</h3>
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <p data-editable="true" style="font-size:15px;color:#334155;margin:0;">ポイント1</p>
        </div>
      </div>
      <div style="background:linear-gradient(135deg,#FFF7ED,#FFEDD5);border-radius:16px;padding:28px;border-top:4px solid #F97316;">
        <h3 data-editable="true" style="font-size:22px;font-weight:700;color:#C2410C;margin:0 0 16px 0;">カテゴリB</h3>
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <p data-editable="true" style="font-size:15px;color:#334155;margin:0;">ポイント1</p>
        </div>
      </div>
    </div>
  </div>
</div>`;

const CARD_GRID_EXAMPLE = `
■ 出力例（アイコン付きカードグリッド）
<div style="width:1280px;height:720px;overflow:hidden;font-family:'Segoe UI','Hiragino Sans',sans-serif;position:relative;background:#FFFFFF;">
  <div style="padding:48px 56px;position:relative;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <div style="width:5px;height:36px;background:#3B82F6;border-radius:3px;"></div>
      <h2 data-editable="true" style="font-size:32px;font-weight:700;color:#1E293B;margin:0;">スライドタイトル</h2>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div style="background:#F8FAFC;border-radius:12px;padding:24px;border-left:4px solid #3B82F6;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:40px;height:40px;border-radius:10px;background:rgba(59,130,246,0.1);display:flex;align-items:center;justify-content:center;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3 data-editable="true" style="font-size:18px;font-weight:600;color:#1E293B;margin:0;">項目タイトル</h3>
        </div>
        <p data-editable="true" style="font-size:14px;color:#64748B;line-height:1.6;margin:0;">項目の説明文をここに記載</p>
      </div>
      <div style="background:#F8FAFC;border-radius:12px;padding:24px;border-left:4px solid #10B981;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:40px;height:40px;border-radius:10px;background:rgba(16,185,129,0.1);display:flex;align-items:center;justify-content:center;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>
          </div>
          <h3 data-editable="true" style="font-size:18px;font-weight:600;color:#1E293B;margin:0;">項目タイトル</h3>
        </div>
        <p data-editable="true" style="font-size:14px;color:#64748B;line-height:1.6;margin:0;">項目の説明文をここに記載</p>
      </div>
    </div>
  </div>
</div>`;

const VISUAL_DIRECTIVE_MAP: Record<string, string> = {
  statistics:
    "必ずCSSテーブル（display:grid、ヘッダー濃色背景、交互行色）を使用してデータを視覚化すること。",
  flow: "必ずフロー図（番号付き丸 + SVG矢印コネクタ + ステップ説明）を使用してプロセスを視覚化すること。",
  comparison:
    "必ず左右対比の2カラムレイアウト（各列ヘッダー色を変え、SVGチェックアイコン付き）を使用すること。",
  list: "必ずCSS Grid カードレイアウト（各カードにSVGアイコン＋色付きボーダー＋タイトル＋説明）を使用すること。単純な箇条書きは禁止。",
};

const RENDER_COLOR_MAP: Record<string, { dark: string; light: string; bg: string }> = {
  ブルー: { dark: "#1E3A5F", light: "#3B82F6", bg: "#F0F7FF" },
  グリーン: { dark: "#064E3B", light: "#10B981", bg: "#ECFDF5" },
  ピンク: { dark: "#831843", light: "#EC4899", bg: "#FDF2F8" },
  イエロー: { dark: "#713F12", light: "#F59E0B", bg: "#FFFBEB" },
  パープル: { dark: "#4C1D95", light: "#8B5CF6", bg: "#F5F3FF" },
  レッド: { dark: "#7F1D1D", light: "#EF4444", bg: "#FEF2F2" },
  モノクロ: { dark: "#1F2937", light: "#6B7280", bg: "#F9FAFB" },
  ダーク: { dark: "#0F172A", light: "#334155", bg: "#1E293B" },
};

export function buildRenderPrompt(
  slideSection: string,
  slideTitle: string,
  slideIndex: number,
  totalSlides: number,
  deckTitle: string,
  slideType: string,
  styleOptions?: StyleOptions,
): string {
  const textElements = extractDisplayTexts(slideSection);
  const layout = extractPlanField(slideSection, "レイアウト") || "split-screen";
  const design = extractPlanField(slideSection, "デザイン");
  const visual = extractPlanField(slideSection, "ビジュアル要素");
  const colors = RENDER_COLOR_MAP[styleOptions?.colorStyle || ""] || RENDER_COLOR_MAP["ブルー"];

  // If no text elements, use non-metadata lines
  const effectiveTexts =
    textElements.length > 0
      ? textElements
      : slideSection
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !PLAN_META_PATTERN.test(l));

  const textList =
    effectiveTexts
      .slice(0, 10)
      .map((t, i) => `  ${i + 1}. ${t}`)
      .join("\n") || "  （タイトルのみ）";

  const contentHints = detectContentHints(slideTitle, effectiveTexts.join(" "));

  // Select visual directive
  const visualLower = (visual || "").toLowerCase();
  let visualDirective =
    "SVGアイコン、色付きブロック、グラデーション等のビジュアル要素を必ず含めること。テキストだけのスライドは禁止。";
  for (const [key, directive] of Object.entries(VISUAL_DIRECTIVE_MAP)) {
    if (
      contentHints.includes(key as ContentHint) ||
      visualLower.includes(
        key === "statistics" ? "テーブル" : key === "flow" ? "フロー" : key,
      )
    ) {
      visualDirective = directive;
      break;
    }
  }
  if (
    effectiveTexts.length >= 3 &&
    visualDirective.includes("ビジュアル要素を必ず含め")
  ) {
    visualDirective = VISUAL_DIRECTIVE_MAP.list;
  }

  // Select example HTML — override cover colors if styleOptions.colorStyle is set
  let exampleHtml = "";
  if (slideType === "cover") {
    if (styleOptions?.colorStyle) {
      // Don't show the hardcoded blue cover example — let styleOptions guide the LLM
      exampleHtml = `\n■ カバースライドのデザイン指針\nwidth:1280px, height:720px。${styleOptions.colorStyle}系のグラデーション背景（暗→明）に白文字。中央揃え、タイトル48px、サブタイトル20px、日付14px。`;
    } else {
      exampleHtml = COVER_EXAMPLE;
    }
  } else if (
    contentHints.includes("statistics") ||
    /テーブル|table/i.test(visualLower)
  ) {
    exampleHtml = STATS_EXAMPLE;
  } else if (
    contentHints.includes("flow") ||
    /フロー|ステップ/i.test(visualLower)
  ) {
    exampleHtml = FLOW_EXAMPLE;
  } else if (contentHints.includes("comparison") || /比較/i.test(visualLower)) {
    exampleHtml = COMPARISON_EXAMPLE;
  } else if (slideType === "content") {
    exampleHtml = CARD_GRID_EXAMPLE;
  }

  // Style options section
  let styleSection = "";
  if (styleOptions) {
    const parts: string[] = [];
    if (styleOptions.industry)
      parts.push(`- 対象産業: ${styleOptions.industry}`);
    if (styleOptions.profession)
      parts.push(`- 対象職種: ${styleOptions.profession}`);
    if (styleOptions.ageGroup)
      parts.push(`- 対象年代層: ${styleOptions.ageGroup}`);
    if (styleOptions.colorStyle)
      parts.push(
        `- 色スタイル: ${styleOptions.colorStyle}（メインカラーとして全体デザインに反映）`,
      );
    if (styleOptions.font)
      parts.push(`- フォント: ${styleOptions.font}（font-familyに指定）`);
    if (styleOptions.customInstructions)
      parts.push(`- カスタム指示: ${styleOptions.customInstructions}`);
    if (parts.length > 0)
      styleSection = `\n【スタイル指定】\n${parts.join("\n")}\n`;
  }

  // Build global context: all slide titles so LLM understands the full deck structure
  const allSlidesContext = slideSection.includes("## スライド")
    ? ""
    : ""; // Plan sections are passed individually, add deck-level context below

  return `以下の設計指示に従い、プレゼンスライド1枚分のリッチなHTML+インラインCSSを出力してください。
<div>タグ1つだけを出力。説明文・マークダウン不要。

【基本情報】
デッキ: ${deckTitle} | ページ: ${slideIndex + 1}/${totalSlides} | タイプ: ${slideType} | タイトル: ${slideTitle}

【デッキ全体のデザイン統一ルール（最重要）】
このスライドは ${totalSlides} 枚のデッキの ${slideIndex + 1} 枚目です。
デッキ全体で以下を統一してください：
- **配色**: ${design || `メインカラー ${colors.light}、ダーク ${colors.dark}、背景 ${colors.bg}`} — 全スライドでこの配色を厳守
- **ヘッダー**: 全ページ同じ位置・同じスタイルのヘッダー帯を使用（背景色: ${colors.dark}、文字: #FFFFFF）
- **フォント**: ${styleOptions?.font || "'Noto Sans JP', 'Inter', sans-serif"} — 全スライド共通
- **レイアウト基盤**: ヘッダー帯（上部）+ コンテンツ領域（中央）。ページ番号は自動付与されるので生成しないこと
- **ステップ/番号表記**: 「Step3」のように途中の番号だけを使わないこと。このスライドで連番を使う場合は、このスライド内で完結する連番にする（例: 1, 2, 3）
${styleSection}
【ビジュアルデザイン指示】（CSS/HTMLに反映。テキストとして表示しないこと）
レイアウト方式: ${layout}
${visualDirective}

【表示テキスト】（以下のみをHTMLテキストノードとして表示）
${textList}

【絶対ルール】
1. ${visualDirective}
2. 「レイアウト:」「デザイン:」等のメタ文字を表示しない
3. width:1280px, height:720px, overflow:hidden
4. テキスト要素に data-editable="true"
5. SVGアイコン、CSSグラデーション、カード、テーブル等のビジュアル要素を積極的に使う
6. 単にテキストを羅列するだけのスライドは絶対に作らない
7. 全タグを閉じ、出力の最後は必ず </div> にする
8. ページ番号は生成しないこと（システムが自動付与する）
${exampleHtml}
━━━ 出力（<div>のみ） ━━━`;
}

// --- Fallback Generators ---

function compact(text: string, maxLen = 80): string {
  const cleaned = (text || "").trim().replace(/\s+/g, " ");
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1).trimEnd() + "…";
}

// --- Dynamic Max Slides ---

export function calcMaxSlides(answer: string): number {
  const charCount = (answer || "").length;
  if (charCount < 200) return 4;
  if (charCount < 500) return 6;
  if (charCount < 1000) return 8;
  return 12;
}

function splitAnswerIntoSections(
  answer: string,
): { title: string; body: string }[] {
  if (!answer?.trim()) return [];

  const lines = answer.trim().split("\n");
  const sections: { title: string; body: string }[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;

    let isHeading = false;
    let headingText = stripped;

    if (/^#{1,4}\s+/.test(stripped)) {
      headingText = stripped.replace(/^#{1,4}\s+/, "").trim();
      isHeading = true;
    } else if (/^\*\*[^*]+\*\*\s*$/.test(stripped)) {
      headingText = stripped.replace(/^\*+|\*+$/g, "").trim();
      isHeading = true;
    } else if (/^【[^】]+】/.test(stripped)) {
      const m = stripped.match(/【([^】]+)】/);
      if (m) headingText = m[1];
      isHeading = true;
    } else if (/^\d+[.）)]\s+.{2,30}$/.test(stripped) && stripped.length < 40) {
      headingText = stripped.replace(/^\d+[.）)]\s+/, "").trim();
      isHeading = true;
    }

    if (isHeading) {
      if (currentTitle || currentBody.length > 0) {
        sections.push({
          title: currentTitle || compact(currentBody[0] || "セクション", 40),
          body: currentBody.join("\n"),
        });
      }
      currentTitle = compact(headingText, 40);
      currentBody = [];
    } else {
      currentBody.push(stripped);
    }
  }

  if (currentTitle || currentBody.length > 0) {
    sections.push({
      title: currentTitle || compact(currentBody[0] || "セクション", 40),
      body: currentBody.join("\n"),
    });
  }

  // If no headings were detected, split by paragraphs or list groups
  if (sections.length <= 1 && lines.length > 4) {
    const paragraphSections: { title: string; body: string }[] = [];
    let chunk: string[] = [];

    for (const line of lines) {
      const stripped = line.trim();
      if (!stripped) {
        if (chunk.length >= 2) {
          paragraphSections.push({
            title: compact(
              chunk[0]
                .replace(/^[-・●▪▸*]\s*/, "")
                .replace(/^\d+[.）)]\s*/, ""),
              40,
            ),
            body: chunk.join("\n"),
          });
          chunk = [];
        }
        continue;
      }
      chunk.push(stripped);
      // Split every 3 lines if chunk gets large
      if (chunk.length >= 4) {
        paragraphSections.push({
          title: compact(
            chunk[0].replace(/^[-・●▪▸*]\s*/, "").replace(/^\d+[.）)]\s*/, ""),
            40,
          ),
          body: chunk.join("\n"),
        });
        chunk = [];
      }
    }
    if (chunk.length > 0) {
      paragraphSections.push({
        title: compact(
          chunk[0].replace(/^[-・●▪▸*]\s*/, "").replace(/^\d+[.）)]\s*/, ""),
          40,
        ),
        body: chunk.join("\n"),
      });
    }

    // Merge sections that are too short (< 2 lines)
    if (paragraphSections.length > 1) {
      const merged: { title: string; body: string }[] = [];
      for (const sec of paragraphSections) {
        const bodyLines = sec.body.split("\n").filter((l) => l.trim());
        if (merged.length > 0 && bodyLines.length < 2) {
          merged[merged.length - 1].body += "\n" + sec.body;
        } else {
          merged.push(sec);
        }
      }
      if (merged.length > 1) return merged;
    }

    if (paragraphSections.length > 1) return paragraphSections;
  }

  return sections;
}

function extractTextElements(body: string, maxItems = 4): string[] {
  if (!body) return [];
  const lines = body.trim().split("\n");
  const elements: string[] = [];
  for (const line of lines) {
    let cleaned = line.trim().replace(/^[-・●▪▸*]\s*/, "");
    cleaned = cleaned.replace(/^\d+[.）)]\s*/, "").trim();
    if (cleaned.length >= 4) {
      elements.push(compact(cleaned, 60));
    }
    if (elements.length >= maxItems) break;
  }
  return elements;
}

export function generateFallbackPlan(
  question: string,
  answer: string,
  maxSlides: number,
  styleOptions?: StyleOptions,
): string {
  const sections = splitAnswerIntoSections(answer || "");
  const deckTitle = compact(question, 60);

  const colorMap: Record<string, [string, string]> = {
    ブルー: ["#1E3A5F", "#3B82F6"],
    グリーン: ["#064E3B", "#10B981"],
    ピンク: ["#831843", "#EC4899"],
    イエロー: ["#713F12", "#F59E0B"],
    パープル: ["#4C1D95", "#8B5CF6"],
    レッド: ["#7F1D1D", "#EF4444"],
    モノクロ: ["#1F2937", "#6B7280"],
    ダーク: ["#0F172A", "#334155"],
  };
  const colorStyle = styleOptions?.colorStyle || "";
  const [accentDark, accentLight] = colorMap[colorStyle] || [
    "#1E3A5F",
    "#3B82F6",
  ];
  const fontNote = styleOptions?.font ? `、フォント: ${styleOptions.font}` : "";

  const lines: string[] = [`# ${deckTitle}`, ""];

  // Cover
  lines.push("## スライド1: タイトル");
  lines.push("- タイプ: cover");
  lines.push("- 表示テキスト:");
  lines.push(`  - ${deckTitle}`);
  lines.push("  - 発表日: 2026年");
  lines.push("- レイアウト: 中央揃え");
  lines.push(
    `- デザイン: グラデーション背景（${accentDark} → ${accentLight}）、白文字44px、サブテキスト20px${fontNote}`,
  );
  lines.push("");

  let slideNum = 2;
  const budget =
    sections.length > 0 ? Math.min(maxSlides - 2, sections.length) : 1;

  if (sections.length === 0) {
    const textItems = extractTextElements(answer || question, 5);
    lines.push(`## スライド${slideNum}: 内容`);
    lines.push("- タイプ: content");
    lines.push("- 表示テキスト:");
    for (const item of textItems.length > 0
      ? textItems
      : [compact(answer || question, 120)]) {
      lines.push(`  - ${item}`);
    }
    lines.push("- レイアウト: cards");
    lines.push(
      `- デザイン: 白背景、左アクセントバー${accentLight}、カード影付き${fontNote}`,
    );
    lines.push("- ビジュアル要素: SVGアイコン付きカードグリッド");
    lines.push("");
    slideNum++;
  } else {
    for (const section of sections.slice(0, budget)) {
      const textItems = extractTextElements(section.body, 5);
      const hints = detectContentHints(section.title, section.body);

      lines.push(`## スライド${slideNum}: ${section.title}`);
      lines.push("- タイプ: content");
      lines.push("- 表示テキスト:");
      for (const item of textItems.length > 0 ? textItems : [section.title]) {
        lines.push(`  - ${item}`);
      }

      let layoutVal: string;
      let visualVal: string;
      if (hints.includes("comparison")) {
        layoutVal = "comparison";
        visualVal = "左右対比の2カラムレイアウト、各列に色分けヘッダー";
      } else if (hints.includes("flow")) {
        layoutVal = "timeline";
        visualVal = "番号付き丸＋SVG矢印コネクタのステップフロー";
      } else if (hints.includes("statistics")) {
        layoutVal = "data-chart";
        visualVal = `CSSバーチャートまたはテーブル（ヘッダー${accentLight}、交互行色）`;
      } else if (textItems.length >= 3) {
        layoutVal = "icon-grid";
        visualVal = "SVGアイコン付き2×2または3列カードグリッド";
      } else {
        layoutVal = "split-screen";
        visualVal = "左側テキスト＋右側アクセントブロック";
      }

      lines.push(`- レイアウト: ${layoutVal}`);
      lines.push(
        `- デザイン: 白背景#FFFFFF、アクセント${accentLight}、タイトル28px太字、本文16px${fontNote}`,
      );
      lines.push(`- ビジュアル要素: ${visualVal}`);
      lines.push("");
      slideNum++;
    }
  }

  // Back-cover
  const summaryItems =
    sections.length > 0
      ? sections.slice(0, 3).map((s) => s.title)
      : [compact(answer || question, 60)];
  lines.push(`## スライド${slideNum}: まとめ`);
  lines.push("- タイプ: back-cover");
  lines.push("- 表示テキスト:");
  for (const item of summaryItems) {
    lines.push(`  - ${item}`);
  }
  lines.push("  - ご清聴ありがとうございました");
  lines.push("- レイアウト: 中央揃え");
  lines.push(
    `- デザイン: グラデーション背景（${accentDark} → ${accentLight}）、白文字${fontNote}`,
  );
  lines.push("");

  return lines.join("\n");
}

// --- Fallback HTML (no LLM) ---

const PRESET_THEMES: Record<
  string,
  { bg: string; bg2: string; accent: string; text: string; muted: string }
> = {
  blueprint: {
    bg: "#0F172A",
    bg2: "#1E293B",
    accent: "#38BDF8",
    text: "#F1F5F9",
    muted: "#94A3B8",
  },
  corporate: {
    bg: "#FFFFFF",
    bg2: "#F8FAFC",
    accent: "#3B82F6",
    text: "#1E293B",
    muted: "#64748B",
  },
  minimal: {
    bg: "#FFFFFF",
    bg2: "#F9FAFB",
    accent: "#6B7280",
    text: "#111827",
    muted: "#9CA3AF",
  },
  "sketch-notes": {
    bg: "#FFFBEB",
    bg2: "#FEF3C7",
    accent: "#D97706",
    text: "#451A03",
    muted: "#92400E",
  },
  "dark-atmospheric": {
    bg: "#18181B",
    bg2: "#27272A",
    accent: "#A78BFA",
    text: "#F4F4F5",
    muted: "#A1A1AA",
  },
  "bold-editorial": {
    bg: "#FFFFFF",
    bg2: "#FDF2F8",
    accent: "#EC4899",
    text: "#1F2937",
    muted: "#6B7280",
  },
};

export function generateFallbackHtml(
  slideTitle: string,
  slideType: string,
  textElements: string[],
  deckTitle: string,
  stylePreset = "corporate",
): string {
  const theme = PRESET_THEMES[stylePreset] || PRESET_THEMES.corporate;
  const { bg, bg2, accent, text: txt, muted } = theme;
  const base = `width:1280px;height:720px;overflow:hidden;font-family:'Segoe UI','Hiragino Sans',sans-serif;position:relative;`;

  // Cover / back-cover
  if (slideType === "cover" || slideType === "back-cover") {
    const subtitle =
      slideType === "cover" ? "" : "ご清聴ありがとうございました";
    const mainTitle = slideType === "cover" ? deckTitle : slideTitle;
    return `<div style="${base}background:linear-gradient(135deg,${accent} 0%,${bg2} 100%);display:flex;align-items:center;justify-content:center;">
  <div style="text-align:center;width:80%;">
    <h1 data-editable="true" style="font-size:44px;font-weight:700;color:#fff;margin:0 0 20px 0;line-height:1.3;text-shadow:0 2px 8px rgba(0,0,0,0.3);">${mainTitle}</h1>
    <h2 data-editable="true" style="font-size:20px;font-weight:400;color:rgba(255,255,255,0.85);margin:0;line-height:1.5;">${subtitle}</h2>
  </div>
</div>`;
  }

  // Content slide — icon card grid
  const icons = [
    `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2"><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/><line x1="10" y1="22" x2="14" y2="22"/></svg>`,
    `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>`,
  ];

  const n = textElements.length;
  let contentBody = "";

  if (n >= 4) {
    const cols = n <= 6 ? 2 : 3;
    const cards = textElements
      .slice(0, 6)
      .map(
        (el, i) =>
          `<div style="background:${bg2};border-radius:12px;padding:20px 24px;border-left:4px solid ${accent};">` +
          `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">` +
          `${icons[i % icons.length]}` +
          `<h3 data-editable="true" style="font-size:17px;font-weight:600;color:${txt};margin:0;">${compact(el.split("：")[0].split(":")[0], 40)}</h3>` +
          `</div>` +
          `<p data-editable="true" style="font-size:14px;color:${muted};line-height:1.5;margin:0;">${compact(el, 120)}</p>` +
          `</div>`,
      )
      .join("");
    contentBody = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:20px;margin-top:24px;">${cards}</div>`;
  } else if (n >= 2) {
    const items = textElements
      .slice(0, 6)
      .map(
        (el, i) =>
          `<div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:20px;background:${bg2};border-radius:10px;padding:18px 20px;">` +
          `<div style="flex-shrink:0;width:44px;height:44px;border-radius:10px;background:${accent}15;display:flex;align-items:center;justify-content:center;">${icons[i % icons.length]}</div>` +
          `<p data-editable="true" style="font-size:17px;color:${txt};line-height:1.6;margin:0;font-weight:500;">${el}</p>` +
          `</div>`,
      )
      .join("");
    contentBody = `<div style="margin-top:24px;">${items}</div>`;
  } else if (n === 1) {
    contentBody =
      `<div style="margin-top:40px;padding:32px;background:${bg2};border-radius:16px;border-left:5px solid ${accent};">` +
      `<div style="display:flex;align-items:center;gap:16px;">${icons[0]}` +
      `<p data-editable="true" style="font-size:22px;color:${txt};line-height:1.6;margin:0;font-weight:500;">${textElements[0]}</p>` +
      `</div></div>`;
  }

  const deco = `<div style="position:absolute;top:0;right:0;width:200px;height:200px;background:linear-gradient(135deg,${accent}10 0%,transparent 60%);border-bottom-left-radius:100%;"></div>`;

  return `<div style="${base}background:${bg};">
  ${deco}
  <div style="padding:48px 56px;position:relative;z-index:1;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      <div style="width:5px;height:36px;background:${accent};border-radius:3px;"></div>
      <h2 data-editable="true" style="font-size:32px;font-weight:700;color:${txt};margin:0;">${slideTitle}</h2>
    </div>
    ${contentBody}
  </div>
  <div style="position:absolute;bottom:0;left:0;right:0;height:36px;background:${bg2};border-top:1px solid ${accent}20;display:flex;align-items:center;justify-content:space-between;padding:0 32px;">
    <span style="font-size:11px;color:${muted};">${deckTitle}</span>
  </div>
</div>`;
}
