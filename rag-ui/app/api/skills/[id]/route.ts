import { NextRequest, NextResponse } from "next/server";
import { updateSkill, deleteSkill } from "@/lib/skills-db";
import { updateSkillFiles } from "@/lib/skill-storage";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const skillId = Number(id);
  try {
    const body = await req.json();

    // Sync content to disk if content was updated
    if (body.content !== undefined) {
      try {
        await updateSkillFiles(String(skillId), body.content);
        body.content_dir = String(skillId);
      } catch (e) {
        console.warn("[skills] disk update failed:", e);
      }
    }

    await updateSkill(skillId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/skills/[id] error:", e);
    return NextResponse.json(
      { error: "Failed to update skill" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const skillId = Number(id);
  try {
    // deleteSkill handles disk cleanup internally
    await deleteSkill(skillId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/skills/[id] error:", e);
    return NextResponse.json(
      { error: "Failed to delete skill" },
      { status: 500 },
    );
  }
}
