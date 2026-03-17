import { NextRequest, NextResponse } from "next/server";
import { updateMessage } from "@/lib/chat-db";

type Params = { params: Promise<{ id: string; msgId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, msgId } = await params;
  try {
    const { parts, stopped } = await req.json();
    await updateMessage(msgId, id, { parts, stopped });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/history/chats/[id]/messages/[msgId] error:", e);
    return NextResponse.json(
      { error: "Failed to update message" },
      { status: 500 },
    );
  }
}
