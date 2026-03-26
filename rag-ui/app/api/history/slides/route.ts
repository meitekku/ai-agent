import { NextRequest, NextResponse } from "next/server";
import { getSlideDeckHistory, saveSlideDeck, getActiveDeckForConversation } from "@/lib/slide-db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // If conversation_id is provided, return the active deck ID for that conversation
  const conversationId = url.searchParams.get("conversation_id");
  if (conversationId) {
    try {
      const deckId = await getActiveDeckForConversation(conversationId);
      return NextResponse.json({ deckId });
    } catch (e) {
      console.error("GET /api/history/slides?conversation_id error:", e);
      return NextResponse.json({ deckId: null });
    }
  }

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
    return NextResponse.json(
      { error: "Failed to save slide deck" },
      { status: 500 },
    );
  }
}
