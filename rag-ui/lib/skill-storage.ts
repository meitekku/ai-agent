import { mkdir, writeFile, readFile, readdir, rm, unlink } from "fs/promises";
import { join, dirname } from "path";

/**
 * Skill file storage layer — follows agentskills.io standard.
 *
 * Directory layout per skill:
 *   data/skills/{skillId}/
 *     SKILL.md           <- frontmatter + instructions body
 *     template.html      <- reference files (original names preserved)
 *     scripts/setup.sh   <- nested structure supported
 */

export function getSkillsDir(): string {
  return process.env.SKILLS_DIR || join(process.cwd(), "data", "skills");
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Save skill files to disk.
 * @param skillId  DB skill id (used as directory name)
 * @param body     SKILL.md content (frontmatter + body)
 * @param refs     Optional reference files from ZIP (original paths preserved)
 * @returns content_dir value to store in DB (= String(skillId))
 */
export async function saveSkillFiles(
  skillId: number,
  body: string,
  refs?: { name: string; content: string }[],
): Promise<string> {
  const dir = join(getSkillsDir(), String(skillId));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), body, "utf-8");

  if (refs && refs.length > 0) {
    for (const ref of refs) {
      const refPath = join(dir, ref.name);
      await mkdir(dirname(refPath), { recursive: true });
      await writeFile(refPath, ref.content, "utf-8");
    }
  }

  return String(skillId);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Read SKILL.md body only (strips frontmatter).
 * Used by loadSkill tool — agent reads other files via readFile tool.
 */
export async function readSkillBody(
  contentDir: string,
): Promise<string | null> {
  const skillMd = join(getSkillsDir(), contentDir, "SKILL.md");
  try {
    const raw = await readFile(skillMd, "utf-8");
    return stripFrontmatter(raw);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update skill files on disk.
 * @param contentDir  Relative dir inside SKILLS_DIR (skill id)
 * @param body        New SKILL.md content
 * @param refs        If provided, replaces all non-SKILL.md files
 */
export async function updateSkillFiles(
  contentDir: string,
  body: string,
  refs?: { name: string; content: string }[],
): Promise<void> {
  const dir = join(getSkillsDir(), contentDir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), body, "utf-8");

  if (refs !== undefined) {
    await cleanNonSkillMd(dir);

    for (const ref of refs) {
      const refPath = join(dir, ref.name);
      await mkdir(dirname(refPath), { recursive: true });
      await writeFile(refPath, ref.content, "utf-8");
    }
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Remove entire skill directory from disk */
export async function deleteSkillDir(contentDir: string): Promise<void> {
  const dir = join(getSkillsDir(), contentDir);
  await rm(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length).trim() : content.trim();
}

/** Remove all files/dirs inside `dir` except SKILL.md */
async function cleanNonSkillMd(dir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "SKILL.md") continue;
    const fullPath = join(dir, entry);
    await rm(fullPath, { recursive: true, force: true });
  }
}
