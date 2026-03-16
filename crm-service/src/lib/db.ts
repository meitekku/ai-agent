import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || "postgresql://raguser:ragpass@localhost:5432/lightrag",
      max: 5,
    });
  }
  return pool;
}

export async function ensureCrmTables(): Promise<void> {
  const p = getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS proposal_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(500) NOT NULL UNIQUE,
      service_name VARCHAR(200) DEFAULT '',
      file_data BYTEA NOT NULL,
      file_size INTEGER NOT NULL,
      content_text TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS crm_deal_cache (
      id SERIAL PRIMARY KEY,
      source VARCHAR(20) NOT NULL,
      external_id VARCHAR(200),
      deal_data JSONB NOT NULL,
      analysis JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source, external_id)
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS proposal_history (
      id SERIAL PRIMARY KEY,
      deal_cache_id INTEGER REFERENCES crm_deal_cache(id) ON DELETE SET NULL,
      title VARCHAR(500) NOT NULL,
      deal_data JSONB NOT NULL,
      analysis JSONB NOT NULL,
      pptx_plan JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("[db] CRM tables ensured");
}
