import { NextRequest, NextResponse } from "next/server";
import { getSlideTemplates, saveSlideTemplate } from "@/lib/slide-db";

export async function GET() {
  try {
    const items = await getSlideTemplates();
    return NextResponse.json({ items });
  } catch (e) {
    console.error("GET /api/templates/slides error:", e);
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = await saveSlideTemplate(body);
    return NextResponse.json({ id });
  } catch (e) {
    console.error("POST /api/templates/slides error:", e);
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 });
  }
}
