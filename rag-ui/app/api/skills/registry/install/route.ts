import { NextRequest, NextResponse } from "next/server";
import { createSkill } from "@/lib/skills-db";

function parseFrontmatter(md: string) {
  const match = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {} as Record<string, string>, body: md };

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([\w-]+)\s*:\s*(.+)$/);
    if (kv) frontmatter[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { frontmatter, body: match[2] };
}

async function fetchSkillMd(
  source: string,
  skillId: string,
): Promise<string> {
  const branches = ["main", "master"];
  const paths = [
    `skills/${skillId}/SKILL.md`,
    `${skillId}/SKILL.md`,
    `SKILL.md`,
  ];

  for (const branch of branches) {
    for (const path of paths) {
      const url = `https://raw.githubusercontent.com/${source}/${branch}/${path}`;
      const res = await fetch(url);
      if (res.ok) return res.text();
    }
  }

  // Fallback: try GitHub Trees API to locate SKILL.md
  for (const branch of branches) {
    try {
      const treeRes = await fetch(
        `https://api.github.com/repos/${source}/git/trees/${branch}?recursive=1`,
        { headers: { Accept: "application/vnd.github.v3+json" } },
      );
      if (!treeRes.ok) continue;
      const tree = await treeRes.json();
      const entry = tree.tree?.find(
        (e: { path: string }) =>
          e.path.endsWith("/SKILL.md") &&
          e.path.toLowerCase().includes(skillId.toLowerCase().replace(/^[^/]+-/, "")),
      );
      if (entry) {
        const rawRes = await fetch(
          `https://raw.githubusercontent.com/${source}/${branch}/${entry.path}`,
        );
        if (rawRes.ok) return rawRes.text();
      }
    } catch {
      // ignore tree API errors
    }
  }

  throw new Error(`SKILL.md not found in ${source} for ${skillId}`);
}

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

    const id = await createSkill({
      name,
      description,
      content: body.trim(),
      source_type: "registry",
      registry_id: registryId,
    });

    return NextResponse.json({ id, name, description });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to install skill";
    console.error("POST /api/skills/registry/install error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
