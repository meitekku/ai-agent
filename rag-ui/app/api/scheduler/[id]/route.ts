import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask, deleteTask } from "@/lib/scheduler-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const task = await getTask(parseInt(id, 10));
    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ task });
  } catch (e) {
    console.error("GET /api/scheduler/[id] error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    await updateTask(parseInt(id, 10), body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/scheduler/[id] error:", e);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteTask(parseInt(id, 10));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/scheduler/[id] error:", e);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
