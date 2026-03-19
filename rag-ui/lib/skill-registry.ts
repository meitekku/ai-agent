/**
 * Shared helpers for fetching skills from GitHub repos via skills.sh registry IDs.
 * registry_id format: "{owner}/{repo}/{skillId}"
 */

export function parseFrontmatter(md: string) {
  const match = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {} as Record<string, string>, body: md };

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([\w-]+)\s*:\s*(.+)$/);
    if (kv) frontmatter[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { frontmatter, body: match[2] };
}

export async function fetchSkillMd(
  source: string,
  skillId: string,
): Promise<string> {
  const branches = ["main", "master"];
  const target = skillId.toLowerCase();

  for (const branch of branches) {
    const treeRes = await fetch(
      `https://api.github.com/repos/${source}/git/trees/${branch}?recursive=1`,
      { headers: { Accept: "application/vnd.github.v3+json" } },
    );
    if (!treeRes.ok) continue;

    const tree = await treeRes.json();
    const skillMds = (tree.tree as { path: string }[] | undefined)?.filter(
      (e) => e.path.endsWith("/SKILL.md") || e.path === "SKILL.md",
    );
    if (!skillMds?.length) continue;

    // Single SKILL.md in repo — no ambiguity
    if (skillMds.length === 1) {
      const res = await fetch(
        `https://raw.githubusercontent.com/${source}/${branch}/${skillMds[0].path}`,
      );
      if (res.ok) return res.text();
    }

    // Multiple SKILL.md — match by frontmatter name
    for (const entry of skillMds) {
      const res = await fetch(
        `https://raw.githubusercontent.com/${source}/${branch}/${entry.path}`,
      );
      if (!res.ok) continue;
      const content = await res.text();
      const { frontmatter } = parseFrontmatter(content);
      const name = (frontmatter.name || frontmatter.title || "").toLowerCase();
      if (name === target) return content;
    }
  }

  throw new Error(`SKILL.md not found in ${source} for ${skillId}`);
}

/** Parse a registry_id "owner/repo/skillId" into source + skillId */
export function parseRegistryId(registryId: string) {
  const parts = registryId.split("/");
  if (parts.length < 3) throw new Error(`Invalid registry_id: ${registryId}`);
  const skillId = parts.slice(2).join("/");
  const source = parts.slice(0, 2).join("/");
  return { source, skillId };
}
