import { NextRequest, NextResponse } from "next/server";
import { duplicateSlideDeck } from "@/lib/slide-db";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const deckId = Number(id);
  try {
    const newId = await duplicateSlideDeck(deckId);
    return NextResponse.json({ id: newId });
  } catch (e) {
    console.error("POST /api/history/slides/[id]/duplicate error:", e);
    return NextResponse.json(
      { error: "Failed to duplicate slide deck" },
      { status: 500 },
    );
  }
}
