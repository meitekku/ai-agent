import { NextRequest, NextResponse } from "next/server";
import { getInstalledRegistryIds } from "@/lib/skills-db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ skills: [], installed: [] });
  }

  try {
    const [searchRes, installed] = await Promise.all([
      fetch(`https://skills.sh/api/search?q=${encodeURIComponent(q)}&limit=20`),
      getInstalledRegistryIds(),
    ]);

    if (!searchRes.ok) {
      return NextResponse.json(
        { error: "skills.sh search failed" },
        { status: searchRes.status },
      );
    }

    const data = await searchRes.json();
    return NextResponse.json({
      skills: data.skills || [],
      installed,
    });
  } catch (e) {
    console.error("GET /api/skills/registry error:", e);
    return NextResponse.json(
      { error: "Failed to search skills.sh" },
      { status: 500 },
    );
  }
}
