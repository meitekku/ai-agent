import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  }
  return pool;
}

let tablesReady = false;

export async function ensureUiConfigTable(): Promise<void> {
  if (tablesReady) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ui_config (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        preferences JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    tablesReady = true;
  } finally {
    client.release();
  }
}

export interface UiPreferences {
  sidebarOpen?: boolean;
  [key: string]: unknown;
}

export async function getUiPreferences(): Promise<UiPreferences> {
  await ensureUiConfigTable();
  const res = await getPool().query(
    `SELECT preferences FROM ui_config WHERE id = 1`,
  );
  if (res.rows.length === 0) return {};
  return res.rows[0].preferences as UiPreferences;
}

export async function updateUiPreferences(
  updates: Partial<UiPreferences>,
): Promise<UiPreferences> {
  await ensureUiConfigTable();
  const res = await getPool().query(
    `INSERT INTO ui_config (id, preferences, updated_at)
     VALUES (1, $1::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       preferences = ui_config.preferences || $1::jsonb,
       updated_at = CURRENT_TIMESTAMP
     RETURNING preferences`,
    [JSON.stringify(updates)],
  );
  return res.rows[0].preferences as UiPreferences;
}
