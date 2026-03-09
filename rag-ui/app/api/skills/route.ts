import { NextRequest, NextResponse } from "next/server";
import { getSkills, createSkill } from "@/lib/skills-db";

export async function GET() {
  try {
    const skills = await getSkills();
    return NextResponse.json({ skills });
  } catch (e) {
    console.error("GET /api/skills error:", e);
    return NextResponse.json({ skills: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.content) {
      return NextResponse.json({ error: "name and content are required" }, { status: 400 });
    }
    const id = await createSkill(body);
    return NextResponse.json({ id });
  } catch (e) {
    console.error("POST /api/skills error:", e);
    return NextResponse.json({ error: "Failed to create skill" }, { status: 500 });
  }
}
