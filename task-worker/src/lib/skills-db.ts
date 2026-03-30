import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  return pool;
}

export interface SkillSummary {
  name: string;
  description: string;
}

export interface Skill extends SkillSummary {
  content: string;
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
      `SELECT name, description, content FROM skills WHERE name ILIKE $1 AND enabled = true LIMIT 1`,
      [name],
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  } catch {
    return null;
  }
}
