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

export async function ensureTables(): Promise<void> {
  if (tablesReady) return;
  const client = await getPool().connect();
  try {
    // Same schema as rag-ui/lib/scheduler-db.ts — tables shared via same PostgreSQL
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(200) NOT NULL,
        description   TEXT DEFAULT '',
        cron_expr     VARCHAR(100) NOT NULL,
        prompt        TEXT NOT NULL,
        kb_slug       TEXT,
        allowed_tools TEXT[] DEFAULT '{}',
        max_tool_calls INTEGER DEFAULT 10,
        timeout_sec   INTEGER DEFAULT 300,
        retry_max     INTEGER DEFAULT 1,
        model         VARCHAR(100),
        notify_to     TEXT,
        notify_from   TEXT,
        enabled       BOOLEAN DEFAULT true,
        next_run_at   TIMESTAMPTZ,
        last_run_at   TIMESTAMPTZ,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_executions (
        id            SERIAL PRIMARY KEY,
        task_id       INTEGER NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
        status        VARCHAR(20) DEFAULT 'pending',
        started_at    TIMESTAMPTZ,
        completed_at  TIMESTAMPTZ,
        prompt_tokens INTEGER,
        output_tokens INTEGER,
        tool_calls    JSONB DEFAULT '[]',
        result        TEXT,
        error         TEXT,
        retry_count   INTEGER DEFAULT 0,
        execution_ms  INTEGER,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_notifications (
        id            SERIAL PRIMARY KEY,
        task_id       INTEGER NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
        execution_id  INTEGER REFERENCES task_executions(id) ON DELETE CASCADE,
        type          VARCHAR(20) NOT NULL,
        title         TEXT NOT NULL,
        summary       TEXT,
        read          BOOLEAN DEFAULT false,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    tablesReady = true;
  } finally {
    client.release();
  }
}

// ============================================================
// Execution CRUD (used by worker)
// ============================================================

export async function updateExecution(
  id: number,
  data: Record<string, unknown>,
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(key === "tool_calls" ? JSON.stringify(val) : val);
    }
  }
  if (fields.length === 0) return;

  values.push(id);
  await getPool().query(
    `UPDATE task_executions SET ${fields.join(", ")} WHERE id = $${idx}`,
    values,
  );
}

export async function getStaleExecutions(): Promise<
  { id: number; task_id: number; status: string; started_at: string | null }[]
> {
  const res = await getPool().query(`
    SELECT id, task_id, status, started_at
    FROM task_executions
    WHERE status IN ('pending', 'queued', 'running')
  `);
  return res.rows;
}

export async function getTaskById(
  id: number,
): Promise<{ prompt: string; kb_slug: string | null; allowed_tools: string[]; max_tool_calls: number; timeout_sec: number; retry_max: number } | null> {
  const res = await getPool().query(
    `SELECT prompt, kb_slug, allowed_tools, max_tool_calls, timeout_sec, retry_max FROM scheduled_tasks WHERE id = $1`,
    [id],
  );
  return res.rows.length > 0 ? res.rows[0] : null;
}

// ============================================================
// Notifications
// ============================================================

export async function createNotification(data: {
  task_id: number;
  execution_id?: number;
  type: string;
  title: string;
  summary?: string;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO task_notifications (task_id, execution_id, type, title, summary)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      data.task_id,
      data.execution_id || null,
      data.type,
      data.title,
      data.summary || null,
    ],
  );
}
