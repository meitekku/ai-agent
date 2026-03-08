import { NextRequest, NextResponse } from "next/server";
import { getSlideDeckHistory, saveSlideDeck } from "@/lib/slide-db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || "50");
  const offset = Number(url.searchParams.get("offset") || "0");

  try {
    const items = await getSlideDeckHistory(limit, offset);
    return NextResponse.json({ items });
  } catch (e) {
    console.error("GET /api/history/slides error:", e);
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = await saveSlideDeck(body);
    return NextResponse.json({ id });
  } catch (e) {
    console.error("POST /api/history/slides error:", e);
    return NextResponse.json({ error: "Failed to save slide deck" }, { status: 500 });
  }
}
