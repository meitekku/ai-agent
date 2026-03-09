import { NextRequest, NextResponse } from "next/server";
import { listConversations, createConversation } from "@/lib/chat-db";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const conversations = await listConversations(limit, offset);
    return NextResponse.json({ conversations });
  } catch (e) {
    console.error("GET /api/history/chats error:", e);
    return NextResponse.json({ conversations: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id, title } = await req.json();
    if (!id || !title) {
      return NextResponse.json(
        { error: "id and title are required" },
        { status: 400 },
      );
    }
    await createConversation(id, title);
    return NextResponse.json({ id });
  } catch (e) {
    console.error("POST /api/history/chats error:", e);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 },
    );
  }
}
