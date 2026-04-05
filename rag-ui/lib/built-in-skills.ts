import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import {
  ensureSkillsTables,
  createSkillWithFiles,
} from "./skills-db";
import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";

let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  return pool;
}

interface SkillFrontmatter {
  name: string;
  description: string;
}

function parseFrontmatter(content: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: { name: "", description: "" }, body: content };

  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }

  return {
    frontmatter: {
      name: fm.name || "",
      description: fm.description || "",
    },
    body: match[2],
  };
}

async function collectFiles(
  dir: string,
  base: string = dir,
): Promise<{ name: string; content: string }[]> {
  const files: { name: string; content: string }[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry === "SKILL.md" && dir === base) continue;
    if (entry.startsWith(".")) continue;
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) {
      files.push(...(await collectFiles(fullPath, base)));
    } else {
      const relPath = fullPath.substring(base.length + 1);
      const content = await readFile(fullPath, "utf-8");
      files.push({ name: relPath, content });
    }
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Sync built-in skills from `built-in-skills/` directory to DB + disk.
 * Runs on startup. Skips skills that already exist (by name + source_type='built-in').
 */
export async function syncBuiltInSkills(): Promise<void> {
  const builtInDir = join(process.cwd(), "built-in-skills");

  let entries: string[];
  try {
    entries = await readdir(builtInDir);
  } catch {
    // No built-in-skills directory — standalone build may not include it
    return;
  }

  await ensureSkillsTables();

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const skillDir = join(builtInDir, entry);
    const s = await stat(skillDir);
    if (!s.isDirectory()) continue;

    const skillMdPath = join(skillDir, "SKILL.md");
    let raw: string;
    try {
      raw = await readFile(skillMdPath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter(raw);
    if (!frontmatter.name) continue;

    // Check if already exists
    const existing = await getPool().query(
      `SELECT id, content_dir FROM skills WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [frontmatter.name],
    );

    if (existing.rows.length > 0) {
      // Update content if source is built-in (don't override user-modified skills)
      const row = existing.rows[0];
      if (row.source_type === "built-in") {
        await getPool().query(
          `UPDATE skills SET description = $1, content = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [frontmatter.description, body.trim(), row.id],
        );
      }
      console.log(`[built-in-skills] ✓ ${frontmatter.name} (exists, skipped)`);
      continue;
    }

    // Collect reference files
    const refs = await collectFiles(skillDir);

    // Create skill with files
    const id = await createSkillWithFiles(
      {
        name: frontmatter.name,
        description: frontmatter.description,
        content: body.trim(),
        source_type: "built-in" as any,
      },
      body.trim(),
      refs,
    );

    console.log(
      `[built-in-skills] ✓ ${frontmatter.name} (id=${id}, ${refs.length} ref files)`,
    );
  }
}
