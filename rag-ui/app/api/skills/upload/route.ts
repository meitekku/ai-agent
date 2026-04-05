import { NextRequest, NextResponse } from "next/server";
import { parseSkillZip } from "@/lib/skill-zip-parser";
import { createSkillWithFiles } from "@/lib/skills-db";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { error: ".zip ファイルのみ対応" },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "ファイルサイズは 10MB 以下にしてください" },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const parsed = await parseSkillZip(buffer);

    const id = await createSkillWithFiles(
      {
        name: parsed.name,
        description: parsed.description,
        content: parsed.content,
        source_type: "zip",
      },
      parsed.body,
      parsed.refs,
    );

    return NextResponse.json({ id, name: parsed.name });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ZIP の解析に失敗しました";
    console.error("POST /api/skills/upload error:", e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
