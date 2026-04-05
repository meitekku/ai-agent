import pg from "pg";
import { readFile } from "fs/promises";
import { join } from "path";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  return pool;
}

function getSkillsDir(): string {
  return process.env.SKILLS_DIR || join(process.cwd(), "data", "skills");
}

export function getSkillDirectory(contentDir: string): string {
  return join(getSkillsDir(), contentDir);
}

export interface SkillSummary {
  name: string;
  description: string;
}

export interface Skill extends SkillSummary {
  content: string;
  content_dir?: string | null;
}

export async function getEnabledSkillSummaries(): Promise<SkillSummary[]> {
  try {
    const res = await getPool().query(
      `SELECT name, description FROM skills WHERE enabled = true ORDER BY name`,
    );
    return res.rows;
  } catch {
    return [];
  }
}

export async function getSkillByName(name: string): Promise<Skill | null> {
  try {
    const res = await getPool().query(
      `SELECT name, description, content, content_dir FROM skills WHERE name ILIKE $1 AND enabled = true LIMIT 1`,
      [name],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    let content = row.content || "";
    if (row.content_dir) {
      const diskContent = await readSkillBodyFromDisk(row.content_dir);
      if (diskContent !== null) content = diskContent;
    }

    return {
      name: row.name,
      description: row.description,
      content,
      content_dir: row.content_dir,
    };
  } catch {
    return null;
  }
}

/** Read SKILL.md body from disk (strips frontmatter) */
async function readSkillBodyFromDisk(
  contentDir: string,
): Promise<string | null> {
  try {
    const raw = await readFile(
      join(getSkillsDir(), contentDir, "SKILL.md"),
      "utf-8",
    );
    const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    return match ? raw.slice(match[0].length).trim() : raw.trim();
  } catch {
    return null;
  }
}
