import { NextRequest, NextResponse } from "next/server";
import {
  getConversation,
  updateConversation,
  deleteConversation,
} from "@/lib/chat-db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const data = await getConversation(id);
    if (!data) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/history/chats/[id] error:", e);
    return NextResponse.json(
      { error: "Failed to get conversation" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const body = await req.json();
    await updateConversation(id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/history/chats/[id] error:", e);
    return NextResponse.json(
      { error: "Failed to update conversation" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await deleteConversation(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/history/chats/[id] error:", e);
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 },
    );
  }
}
