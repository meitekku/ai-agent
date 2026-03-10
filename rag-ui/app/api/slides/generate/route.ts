import { generateObject } from "ai";
import { z } from "zod";
import { getSlideModel } from "@/lib/slide-provider";
import { calcMaxSlides } from "@/lib/slide-prompts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SlideSchema = z.object({
  title: z.string().describe("スライドのタイトル"),
  bullets: z.array(z.string()).describe("箇条書きポイント（3〜6個）"),
  speaker_notes: z.string().optional().describe("発表者ノート"),
  table: z
    .object({
      headers: z.array(z.string()),
      rows: z.array(z.array(z.string())),
    })
    .optional()
    .describe("テーブルデータ（数値比較がある場合）"),
  chart: z
    .object({
      type: z.enum(["bar", "line", "pie"]),
      title: z.string(),
      labels: z.array(z.string()),
      datasets: z.array(
        z.object({
          label: z.string(),
          data: z.array(z.number()),
        }),
      ),
    })
    .optional()
    .describe("チャートデータ（数値データがある場合）"),
  layout: z
    .enum(["title", "content", "visual", "comparison", "table"])
    .optional()
    .describe("スライドレイアウト"),
});

const DeckSchema = z.object({
  title: z.string().describe("プレゼンテーション全体のタイトル"),
  summary: z.string().optional().describe("プレゼンテーションの概要（1〜2文）"),
  slides: z.array(SlideSchema).describe("スライド配列"),
});

const SYSTEM_PROMPT = `あなたはプレゼンテーション構成の専門家です。
与えられた質問と回答内容から、構造化されたプレゼンテーションデータを生成してください。

【ルール】
1. 最初のスライドは layout: "title" でタイトルスライドとする
2. 各スライドには3〜6個の箇条書きポイント（bullets）を含める
3. 数値データがある場合は table または chart を追加する
4. chart.type は "bar"/"line"/"pie" から適切なものを選ぶ
5. 数値がない場合は table/chart を省略する（無理に作らない）
6. speaker_notes には発表者向けの補足説明を入れる
7. 日本語で出力する
8. 回答内容が豊富な場合は省略せず十分な枚数のスライドを作成する
9. 最後のスライドはまとめ（要点整理 + ご清聴ありがとうございました）`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      question: string;
      answer: string;
      max_slides?: number;
      mode?: string;
      backend?: "ollama" | "gemini" | "mlx";
    };

    const { question, answer, backend } = body;

    if (!question || !answer) {
      return Response.json(
        { error: "question and answer are required" },
        { status: 400 },
      );
    }

    const maxSlides = body.max_slides || calcMaxSlides(answer);
    const model = getSlideModel();

    const prompt = `以下の情報をもとに、プレゼンテーションの構造化データを生成してください。

## 質問
${question}

## 回答内容
${answer}

## 制約
- スライド枚数: 最大${maxSlides}枚（内容に応じて3〜${maxSlides}枚）
- 最初は title レイアウトのタイトルスライド
- 最後はまとめスライド（要点 + ご清聴ありがとうございました）
- 数値データがある場合のみ table/chart を追加`;

    const result = await generateObject({
      model,
      schema: DeckSchema,
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.3,
    });

    return Response.json({ deck: result.object });
  } catch (err) {
    console.error("[slides/generate] Error:", err);
    return Response.json(
      { error: "Failed to generate structured deck" },
      { status: 500 },
    );
  }
}
