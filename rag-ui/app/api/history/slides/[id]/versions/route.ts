import { NextRequest, NextResponse } from "next/server";
import {
  getSlideVersions,
  getSlidesAtVersion,
  restoreDeckToVersion,
} from "@/lib/slide-db";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const deckId = Number(id);
  const url = new URL(req.url);
  const version = url.searchParams.get("version");

  try {
    if (version) {
      // Get slides at specific version
      const slides = await getSlidesAtVersion(deckId, Number(version));
      return NextResponse.json({ slides });
    }
    // List all versions
    const versions = await getSlideVersions(deckId);
    return NextResponse.json({ versions });
  } catch (e) {
    console.error("GET /api/history/slides/[id]/versions error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const deckId = Number(id);
  try {
    const body = await req.json();
    const targetVersion = body.version;
    if (typeof targetVersion !== "number") {
      return NextResponse.json(
        { error: "version is required" },
        { status: 400 },
      );
    }
    const newVersion = await restoreDeckToVersion(deckId, targetVersion);
    return NextResponse.json({ version: newVersion });
  } catch (e) {
    console.error("POST /api/history/slides/[id]/versions error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
