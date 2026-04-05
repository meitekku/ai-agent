import { NextRequest, NextResponse } from "next/server";
import { createSkillWithFiles } from "@/lib/skills-db";
import { fetchSkillMd, parseFrontmatter } from "@/lib/skill-registry";

export async function POST(req: NextRequest) {
  try {
    const { source, skillId } = await req.json();
    if (!source || !skillId) {
      return NextResponse.json(
        { error: "source and skillId are required" },
        { status: 400 },
      );
    }

    const registryId = `${source}/${skillId}`;
    const raw = await fetchSkillMd(source, skillId);
    const { frontmatter, body } = parseFrontmatter(raw);

    const name = frontmatter.name || frontmatter.title || skillId;
    const description = frontmatter.description || "";

    const id = await createSkillWithFiles(
      {
        name,
        description,
        content: body.trim(),
        source_type: "registry",
        registry_id: registryId,
      },
      body.trim(),
    );

    return NextResponse.json({ id, name, description });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to install skill";
    console.error("POST /api/skills/registry/install error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
