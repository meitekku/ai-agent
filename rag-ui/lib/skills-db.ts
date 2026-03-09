import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";

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
  enabled: boolean;
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

export async function createSkill(data: {
  name: string;
  description?: string;
  content: string;
  enabled?: boolean;
}): Promise<number> {
  await ensureSkillsTables();
  const res = await getPool().query(
    `INSERT INTO skills (name, description, content, enabled)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [data.name, data.description || "", data.content, data.enabled ?? true],
  );
  return res.rows[0].id as number;
}

export async function updateSkill(
  id: number,
  data: {
    name?: string;
    description?: string;
    content?: string;
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

export async function deleteSkill(id: number): Promise<void> {
  await ensureSkillsTables();
  await getPool().query(`DELETE FROM skills WHERE id = $1`, [id]);
}
