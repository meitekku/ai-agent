import { NextResponse } from "next/server";
import {
  getInstalledRegistryIds,
  updateSkillByRegistryId,
} from "@/lib/skills-db";
import {
  fetchSkillMd,
  parseFrontmatter,
  parseRegistryId,
} from "@/lib/skill-registry";

/** POST /api/skills/registry/update — batch-refresh all registry skills */
export async function POST() {
  try {
    const registryIds = await getInstalledRegistryIds();
    if (registryIds.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    let updated = 0;
    await Promise.allSettled(
      registryIds.map(async (rid) => {
        try {
          const { source, skillId } = parseRegistryId(rid);
          const raw = await fetchSkillMd(source, skillId);
          const { frontmatter, body } = parseFrontmatter(raw);
          const name = frontmatter.name || frontmatter.title || skillId;
          const description = frontmatter.description || "";
          const id = await updateSkillByRegistryId(rid, {
            name,
            description,
            content: body.trim(),
          });
          if (id !== null) updated++;
        } catch {
          // skip failed individual updates silently
        }
      }),
    );

    return NextResponse.json({ updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update skills";
    console.error("POST /api/skills/registry/update error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
