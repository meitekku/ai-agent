import JSZip from "jszip";

export interface ParsedSkillRef {
  name: string;
  content: string;
}

export interface ParsedSkill {
  name: string;
  description: string;
  /** SKILL.md body only (no refs appended) */
  body: string;
  /** Structured reference files from ZIP */
  refs: ParsedSkillRef[];
  /** Backward-compatible flattened string (body + refs concatenated) */
  content: string;
}

/**
 * Parse a ZIP file containing SKILL.md (with YAML frontmatter) + optional reference files.
 * Returns structured skill data with body, refs, and backward-compatible content.
 */
export async function parseSkillZip(buffer: ArrayBuffer): Promise<ParsedSkill> {
  const zip = await JSZip.loadAsync(buffer);

  // Find SKILL.md — root or one level deep
  const skillMdPath = findFile(zip, "SKILL.md");
  if (!skillMdPath) {
    throw new Error("ZIP に SKILL.md が見つかりません");
  }

  const skillMdContent = await zip.file(skillMdPath)!.async("string");

  // Parse frontmatter
  const { frontmatter, body: skillBody } = parseFrontmatter(skillMdContent);
  const name = frontmatter.name || frontmatter.title || "";
  const description = frontmatter.description || "";

  if (!name) {
    throw new Error("SKILL.md の frontmatter に name が必要です");
  }

  // Collect reference files
  const refs = await collectReferences(zip, skillMdPath);

  // Build backward-compatible flattened content
  const body = skillBody.trim();
  let content = body;
  if (refs.length > 0) {
    content += "\n\n---\n\n## References\n";
    for (const ref of refs) {
      content += `\n### ${ref.name}\n\n${ref.content.trim()}\n`;
    }
  }

  return { name, description, body, refs, content };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFile(zip: JSZip, filename: string): string | null {
  // Check root
  if (zip.file(filename)) return filename;

  // Check one-level subdirectory (e.g., skill-name/SKILL.md)
  for (const path of Object.keys(zip.files)) {
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 2 && parts[1] === filename) {
      return path;
    }
  }
  return null;
}

function parseFrontmatter(md: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: md };
  }

  const yamlBlock = match[1];
  const body = match[2];

  // Simple YAML key-value parser (no nested structures needed)
  const frontmatter: Record<string, string> = {};
  for (const line of yamlBlock.split("\n")) {
    const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (kv) {
      // Strip surrounding quotes
      frontmatter[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
    }
  }

  return { frontmatter, body };
}

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "__MACOSX",
]);
const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".html",
  ".css",
  ".js",
  ".ts",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".xml",
  ".toml",
  ".sh",
  ".py",
  ".sql",
]);

async function collectReferences(
  zip: JSZip,
  skillMdPath: string,
): Promise<{ name: string; content: string }[]> {
  // Determine the base directory of SKILL.md
  const baseDir = skillMdPath.includes("/")
    ? skillMdPath.substring(0, skillMdPath.lastIndexOf("/") + 1)
    : "";

  const refs: { name: string; content: string }[] = [];

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (path === skillMdPath) continue;
    if (!path.startsWith(baseDir)) continue;

    // Get path relative to base
    const relPath = path.substring(baseDir.length);

    // Skip ignored directories
    const topDir = relPath.split("/")[0].toLowerCase();
    if (IGNORED_DIRS.has(topDir)) continue;

    // Only include text files
    const ext = relPath.substring(relPath.lastIndexOf(".")).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;

    const content = await entry.async("string");
    if (content.trim()) {
      refs.push({ name: relPath, content });
    }
  }

  // Sort by path for deterministic output
  refs.sort((a, b) => a.name.localeCompare(b.name));
  return refs;
}
