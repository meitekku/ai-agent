import pg from "pg";
import {
  readSkillBody,
  deleteSkillDir,
  getSkillsDir,
  saveSkillFiles,
} from "./skill-storage";
import { join } from "path";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";

// Lazy singleton pool (shared with slide-db via same DATABASE_URL)
let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  }
  return pool;
}

// ============================================================
// Schema — CREATE TABLE IF NOT EXISTS
// ============================================================

let tablesReady = false;

export async function ensureSkillsTables(): Promise<void> {
  if (tablesReady) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS skills (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT DEFAULT '',
        content TEXT NOT NULL,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'manual'
    `);
    await client.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS registry_id VARCHAR(300)
    `);
    await client.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS content_dir VARCHAR(300)
    `);
    // Allow content to be empty for new skills that store content on disk
    await client.query(`
      ALTER TABLE skills ALTER COLUMN content SET DEFAULT ''
    `);
    await client.query(`
      ALTER TABLE skills ALTER COLUMN content DROP NOT NULL
    `);
    tablesReady = true;
  } finally {
    client.release();
  }
}

// ============================================================
// Types
// ============================================================

export interface Skill {
  id: number;
  name: string;
  description: string;
  content: string;
  content_dir?: string | null;
  enabled: boolean;
  source_type: "manual" | "zip" | "registry" | "built-in";
  registry_id?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// CRUD
// ============================================================

export async function getSkills(): Promise<Skill[]> {
  await ensureSkillsTables();
  const res = await getPool().query(
    `SELECT * FROM skills ORDER BY created_at DESC`,
  );
  return res.rows.map((r) => ({
    ...r,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

export async function getEnabledSkills(): Promise<Skill[]> {
  await ensureSkillsTables();
  const res = await getPool().query(
    `SELECT * FROM skills WHERE enabled = true ORDER BY created_at ASC`,
  );
  return res.rows.map((r) => ({
    ...r,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

/** Lightweight summaries for system prompt (no content) */
export async function getEnabledSkillSummaries(): Promise<
  Pick<Skill, "name" | "description">[]
> {
  await ensureSkillsTables();
  const res = await getPool().query(
    `SELECT name, description FROM skills WHERE enabled = true ORDER BY created_at ASC`,
  );
  return res.rows;
}

/** Load a single skill's full content by name.
 *  Prefers disk (content_dir) over DB (content column). */
export async function getSkillByName(name: string): Promise<Skill | null> {
  await ensureSkillsTables();
  const res = await getPool().query(
    `SELECT * FROM skills WHERE enabled = true AND LOWER(name) = LOWER($1) LIMIT 1`,
    [name],
  );
  if (res.rows.length === 0) return null;
  const r = res.rows[0];

  let content = r.content || "";
  if (r.content_dir) {
    const diskContent = await readSkillBody(r.content_dir);
    if (diskContent !== null) content = diskContent;
  }

  return {
    ...r,
    content,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

/** Get the skill directory path for loadSkill tool */
export function getSkillDirectory(contentDir: string): string {
  return join(getSkillsDir(), contentDir);
}

export async function createSkill(data: {
  name: string;
  description?: string;
  content?: string;
  content_dir?: string;
  enabled?: boolean;
  source_type?: "manual" | "zip" | "registry" | "built-in";
  registry_id?: string;
}): Promise<number> {
  await ensureSkillsTables();
  const res = await getPool().query(
    `INSERT INTO skills (name, description, content, content_dir, enabled, source_type, registry_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      data.name,
      data.description || "",
      data.content || "",
      data.content_dir || null,
      data.enabled ?? true,
      data.source_type || "manual",
      data.registry_id || null,
    ],
  );
  return res.rows[0].id as number;
}

/**
 * Create a skill in DB and save files to disk in one call.
 * If disk write fails, the skill still works from the DB content column.
 */
export async function createSkillWithFiles(
  data: Parameters<typeof createSkill>[0],
  body: string,
  refs?: { name: string; content: string }[],
): Promise<number> {
  const id = await createSkill(data);
  try {
    const contentDir = await saveSkillFiles(id, body, refs);
    await updateSkill(id, { content_dir: contentDir });
  } catch (e) {
    console.warn("[skills] disk write failed, falling back to DB:", e);
  }
  return id;
}

export async function getInstalledRegistryIds(): Promise<string[]> {
  await ensureSkillsTables();
  const res = await getPool().query(
    `SELECT registry_id FROM skills WHERE registry_id IS NOT NULL`,
  );
  return res.rows.map((r) => r.registry_id as string);
}

export async function updateSkill(
  id: number,
  data: {
    name?: string;
    description?: string;
    content?: string;
    content_dir?: string;
    enabled?: boolean;
  },
): Promise<void> {
  await ensureSkillsTables();
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    fields.push(`description = $${idx++}`);
    values.push(data.description);
  }
  if (data.content !== undefined) {
    fields.push(`content = $${idx++}`);
    values.push(data.content);
  }
  if (data.content_dir !== undefined) {
    fields.push(`content_dir = $${idx++}`);
    values.push(data.content_dir);
  }
  if (data.enabled !== undefined) {
    fields.push(`enabled = $${idx++}`);
    values.push(data.enabled);
  }

  if (fields.length === 0) return;

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  await getPool().query(
    `UPDATE skills SET ${fields.join(", ")} WHERE id = $${idx}`,
    values,
  );
}

export async function updateSkillByRegistryId(
  registryId: string,
  data: { name: string; description: string; content: string },
): Promise<number | null> {
  await ensureSkillsTables();
  const res = await getPool().query(
    `UPDATE skills SET name = $1, description = $2, content = $3, updated_at = CURRENT_TIMESTAMP
     WHERE registry_id = $4 RETURNING id`,
    [data.name, data.description, data.content, registryId],
  );
  return res.rows.length > 0 ? (res.rows[0].id as number) : null;
}

export async function deleteSkill(id: number): Promise<void> {
  await ensureSkillsTables();
  const res = await getPool().query(
    `DELETE FROM skills WHERE id = $1 RETURNING content_dir`,
    [id],
  );
  if (res.rows.length > 0 && res.rows[0].content_dir) {
    await deleteSkillDir(res.rows[0].content_dir);
  }
}
