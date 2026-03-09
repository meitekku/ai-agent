import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";

// Lazy singleton pool (shared with other db modules via same DATABASE_URL)
let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  }
  return pool;
}

// ============================================================
// Schema — single-row config table
// ============================================================

let tablesReady = false;

export async function ensureKbConfigTable(): Promise<void> {
  if (tablesReady) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS kb_config (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        title VARCHAR(200) NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    tablesReady = true;
  } finally {
    client.release();
  }
}

// ============================================================
// CRUD
// ============================================================

export interface KbConfig {
  title: string;
  description: string;
}

export async function getKbConfig(): Promise<KbConfig | null> {
  await ensureKbConfigTable();
  const res = await getPool().query(`SELECT title, description FROM kb_config WHERE id = 1`);
  if (res.rows.length === 0) return null;
  return { title: res.rows[0].title, description: res.rows[0].description };
}

export async function upsertKbConfig(title: string, description: string): Promise<void> {
  await ensureKbConfigTable();
  await getPool().query(
    `INSERT INTO kb_config (id, title, description, updated_at)
     VALUES (1, $1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       updated_at = CURRENT_TIMESTAMP`,
    [title, description],
  );
}
