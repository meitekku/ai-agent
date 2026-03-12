import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/lib/rag-client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const maxNodes = Number(req.nextUrl.searchParams.get("max_nodes") ?? "2000");

  try {
    const data = await getGraph(slug, maxNodes);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
