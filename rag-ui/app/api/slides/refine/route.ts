import { generateObject } from "ai";
import { z } from "zod";
import { getSlideModel } from "@/lib/slide-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SlideSchema = z.object({
  title: z.string(),
  layout: z
    .enum(["title", "content", "visual", "table", "chart", "comparison"])
    .nullable()
    .optional(),
  bullets: z.array(z.string()),
  speaker_notes: z.string().optional(),
  table: z
    .object({
      headers: z.array(z.string()).optional(),
      rows: z.array(z.array(z.string())).optional(),
    })
    .nullable()
    .optional(),
  chart: z
    .object({
      type: z.enum(["bar", "line", "pie"]).optional(),
      title: z.string().optional(),
      labels: z.array(z.string()).optional(),
      datasets: z
        .array(
          z.object({
            label: z.string().optional(),
            data: z.array(z.number()).optional(),
          }),
        )
        .optional(),
    })
    .nullable()
    .optional(),
});

const DeckSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  slides: z.array(SlideSchema),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { deck, instruction, backend } = body;

    if (!deck || !instruction) {
      return Response.json(
        { error: "deck and instruction are required" },
        { status: 400 },
      );
    }

    const model = getSlideModel();

    const result = await generateObject({
      model,
      schema: DeckSchema,
      prompt: `You are a slide deck editor. Refine the following slide deck according to the instruction.

Current deck:
${JSON.stringify(deck, null, 2)}

Instruction: ${instruction}

Return the refined deck in the same structure. Keep the same number of slides unless the instruction requires adding or removing. Use Japanese for content.`,
      temperature: 0.3,
    });

    return Response.json({ deck: result.object });
  } catch (err) {
    console.error("[slides/refine] error:", err);
    return Response.json(
      { error: "Failed to refine slide deck" },
      { status: 500 },
    );
  }
}
