import { NextRequest, NextResponse } from "next/server";
import {
  getUnreadNotifications,
  getAllNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
} from "@/lib/scheduler-db";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const all = url.searchParams.get("all") === "true";
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const notifications = all
      ? await getAllNotifications(limit)
      : await getUnreadNotifications(limit);
    return NextResponse.json({ notifications });
  } catch (e) {
    console.error("GET /api/notifications error:", e);
    return NextResponse.json({ notifications: [] });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.all === true) {
      await markAllNotificationsRead();
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      await markNotificationsRead(body.ids);
    } else {
      return NextResponse.json(
        { error: "Provide { ids: number[] } or { all: true }" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/notifications error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
