import { NextRequest, NextResponse } from "next/server";
import { saveMessages, updateConversation } from "@/lib/chat-db";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const { messages, active_leaf_id } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 },
      );
    }
    await saveMessages(id, messages);
    if (active_leaf_id) {
      await updateConversation(id, { active_leaf_id });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/history/chats/[id]/messages error:", e);
    return NextResponse.json(
      { error: "Failed to save messages" },
      { status: 500 },
    );
  }
}
