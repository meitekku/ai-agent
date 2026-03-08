import { NextRequest, NextResponse } from "next/server";
import { deleteSlideTemplate } from "@/lib/slide-db";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await deleteSlideTemplate(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/templates/slides/[id] error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
