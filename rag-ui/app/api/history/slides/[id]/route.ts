import { NextRequest, NextResponse } from "next/server";
import {
  getSlideDeckDetail,
  updateSlideDeck,
  renameSlideDeck,
  deleteSlideDeck,
} from "@/lib/slide-db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const deckId = Number(id);
  try {
    const detail = await getSlideDeckDetail(deckId);
    if (!detail)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    console.error("GET /api/history/slides/[id] error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const deckId = Number(id);
  try {
    const body = await req.json();
    await updateSlideDeck(deckId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/history/slides/[id] error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const deckId = Number(id);
  try {
    const body = await req.json();
    await renameSlideDeck(deckId, body.title);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/history/slides/[id] error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const deckId = Number(id);
  try {
    await deleteSlideDeck(deckId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/history/slides/[id] error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
