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

  await p.query(`
    CREATE TABLE IF NOT EXISTS kintone_deals (
      id SERIAL PRIMARY KEY,
      record_number INTEGER NOT NULL UNIQUE,
      company_name VARCHAR(200) NOT NULL DEFAULT '',
      deal_name VARCHAR(500) NOT NULL DEFAULT '',
      tel VARCHAR(50) DEFAULT '',
      sales_rep VARCHAR(200) DEFAULT '',
      expected_period VARCHAR(200) DEFAULT '',
      industry VARCHAR(100) DEFAULT '',
      customer_rank VARCHAR(100) DEFAULT '',
      address TEXT DEFAULT '',
      product VARCHAR(200) DEFAULT '',
      created_by VARCHAR(200) DEFAULT '',
      updated_by VARCHAR(200) DEFAULT '',
      created_at_kintone TIMESTAMP,
      updated_at_kintone TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS kintone_activities (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL REFERENCES kintone_deals(id) ON DELETE CASCADE,
      activity_date DATE,
      is_new BOOLEAN DEFAULT FALSE,
      is_existing BOOLEAN DEFAULT FALSE,
      contact_department VARCHAR(500) DEFAULT '',
      internal_members VARCHAR(500) DEFAULT '',
      status VARCHAR(100) DEFAULT '',
      activity_type VARCHAR(200) DEFAULT '',
      notes TEXT DEFAULT '',
      win_probability VARCHAR(50) DEFAULT '',
      expected_period VARCHAR(200) DEFAULT '',
      expected_amount BIGINT DEFAULT 0,
      order_amount BIGINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await p.query(`CREATE INDEX IF NOT EXISTS idx_kintone_activities_deal ON kintone_activities(deal_id)`);

  console.log("[db] CRM tables ensured");
}
