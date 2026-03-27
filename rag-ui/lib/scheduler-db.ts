import pg from "pg";
import { Cron } from "croner";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  }
  return pool;
}

// ============================================================
// Schema
// ============================================================

let tablesReady = false;

export async function ensureSchedulerTables(): Promise<void> {
  if (tablesReady) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(200) NOT NULL,
        description   TEXT DEFAULT '',
        cron_expr     VARCHAR(100) NOT NULL,
        prompt        TEXT NOT NULL,
        kb_slug       TEXT,
        allowed_tools TEXT[] DEFAULT '{}',
        max_tool_calls INTEGER DEFAULT 25,
        timeout_sec   INTEGER DEFAULT 600,
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
    // Migration for existing tables
    await client.query(`ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS model VARCHAR(100)`);
    await client.query(`ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS notify_to TEXT`);
    await client.query(`ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS notify_from TEXT`);
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
      CREATE INDEX IF NOT EXISTS idx_task_exec_task ON task_executions(task_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_task_exec_status ON task_executions(status)
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
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_task_notif_read ON task_notifications(read) WHERE NOT read
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_execution_files (
        id            SERIAL PRIMARY KEY,
        execution_id  INTEGER NOT NULL REFERENCES task_executions(id) ON DELETE CASCADE,
        file_id       TEXT NOT NULL,
        filename      TEXT NOT NULL,
        media_type    TEXT NOT NULL,
        size_bytes    BIGINT,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_exec_files_exec ON task_execution_files(execution_id)
    `);
    tablesReady = true;
  } finally {
    client.release();
  }
}

// ============================================================
// Types
// ============================================================

export interface ScheduledTask {
  id: number;
  name: string;
  description: string;
  cron_expr: string;
  prompt: string;
  kb_slug: string | null;
  allowed_tools: string[];
  max_tool_calls: number;
  timeout_sec: number;
  retry_max: number;
  model: string | null;
  notify_to: string | null;
  notify_from: string | null;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskExecution {
  id: number;
  task_id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  prompt_tokens: number | null;
  output_tokens: number | null;
  tool_calls: unknown[];
  result: string | null;
  error: string | null;
  retry_count: number;
  execution_ms: number | null;
  created_at: string;
}

export interface TaskNotification {
  id: number;
  task_id: number;
  execution_id: number | null;
  type: string;
  title: string;
  summary: string | null;
  read: boolean;
  created_at: string;
}

// ============================================================
// Helpers
// ============================================================

function computeNextRunAt(cronExpr: string): Date | null {
  try {
    const job = new Cron(cronExpr);
    const next = job.nextRun();
    return next;
  } catch {
    return null;
  }
}

function rowToTask(r: Record<string, unknown>): ScheduledTask {
  return {
    ...r,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    next_run_at: r.next_run_at ? String(r.next_run_at) : null,
    last_run_at: r.last_run_at ? String(r.last_run_at) : null,
  } as ScheduledTask;
}

function rowToExecution(r: Record<string, unknown>): TaskExecution {
  return {
    ...r,
    created_at: String(r.created_at),
    started_at: r.started_at ? String(r.started_at) : null,
    completed_at: r.completed_at ? String(r.completed_at) : null,
  } as TaskExecution;
}

function rowToNotification(r: Record<string, unknown>): TaskNotification {
  return {
    ...r,
    created_at: String(r.created_at),
  } as TaskNotification;
}

// ============================================================
// CRUD — scheduled_tasks
// ============================================================

export async function createTask(data: {
  name: string;
  description?: string;
  cron_expr: string;
  prompt: string;
  kb_slug?: string;
  allowed_tools?: string[];
  max_tool_calls?: number;
  timeout_sec?: number;
  retry_max?: number;
  model?: string;
  notify_to?: string;
  notify_from?: string;
  enabled?: boolean;
}): Promise<number> {
  await ensureSchedulerTables();
  const nextRun = computeNextRunAt(data.cron_expr);
  const res = await getPool().query(
    `INSERT INTO scheduled_tasks
       (name, description, cron_expr, prompt, kb_slug, allowed_tools,
        max_tool_calls, timeout_sec, retry_max, model, notify_to, notify_from, enabled, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [
      data.name,
      data.description || "",
      data.cron_expr,
      data.prompt,
      data.kb_slug || null,
      data.allowed_tools || [],
      data.max_tool_calls ?? 25,
      data.timeout_sec ?? 600,
      data.retry_max ?? 1,
      data.model || null,
      data.notify_to || null,
      data.notify_from || null,
      data.enabled ?? true,
      nextRun,
    ],
  );
  return res.rows[0].id as number;
}

export async function listTasks(): Promise<ScheduledTask[]> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `SELECT * FROM scheduled_tasks ORDER BY created_at DESC`,
  );
  return res.rows.map(rowToTask);
}

export async function getTask(id: number): Promise<ScheduledTask | null> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `SELECT * FROM scheduled_tasks WHERE id = $1`,
    [id],
  );
  return res.rows.length > 0 ? rowToTask(res.rows[0]) : null;
}

export async function updateTask(
  id: number,
  data: {
    name?: string;
    description?: string;
    cron_expr?: string;
    prompt?: string;
    kb_slug?: string | null;
    allowed_tools?: string[];
    max_tool_calls?: number;
    timeout_sec?: number;
    retry_max?: number;
    enabled?: boolean;
  },
): Promise<void> {
  await ensureSchedulerTables();
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(val);
    }
  }

  if (fields.length === 0) return;

  fields.push(`updated_at = NOW()`);

  // Recompute next_run_at if cron_expr changed
  if (data.cron_expr !== undefined) {
    const nextRun = computeNextRunAt(data.cron_expr);
    fields.push(`next_run_at = $${idx++}`);
    values.push(nextRun);
  }

  values.push(id);
  await getPool().query(
    `UPDATE scheduled_tasks SET ${fields.join(", ")} WHERE id = $${idx}`,
    values,
  );
}

export async function deleteTask(id: number): Promise<void> {
  await ensureSchedulerTables();
  await getPool().query(`DELETE FROM scheduled_tasks WHERE id = $1`, [id]);
}

export async function getTasksDueNow(): Promise<ScheduledTask[]> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `SELECT * FROM scheduled_tasks WHERE enabled = true AND next_run_at <= NOW()`,
  );
  return res.rows.map(rowToTask);
}

export async function updateNextRunAt(id: number, cronExpr: string): Promise<void> {
  const nextRun = computeNextRunAt(cronExpr);
  await getPool().query(
    `UPDATE scheduled_tasks SET next_run_at = $1, last_run_at = NOW() WHERE id = $2`,
    [nextRun, id],
  );
}

// ============================================================
// CRUD — task_executions
// ============================================================

export async function createExecution(taskId: number): Promise<number> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `INSERT INTO task_executions (task_id, status) VALUES ($1, 'pending') RETURNING id`,
    [taskId],
  );
  return res.rows[0].id as number;
}

export async function updateExecution(
  id: number,
  data: {
    status?: string;
    started_at?: Date;
    completed_at?: Date;
    prompt_tokens?: number;
    output_tokens?: number;
    tool_calls?: unknown[];
    result?: string;
    error?: string;
    retry_count?: number;
    execution_ms?: number;
  },
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

export async function listExecutions(
  taskId: number,
  limit = 50,
): Promise<TaskExecution[]> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `SELECT * FROM task_executions WHERE task_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [taskId, limit],
  );
  return res.rows.map(rowToExecution);
}

export async function getExecution(id: number): Promise<TaskExecution | null> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `SELECT * FROM task_executions WHERE id = $1`,
    [id],
  );
  return res.rows.length > 0 ? rowToExecution(res.rows[0]) : null;
}

// ============================================================
// CRUD — task_notifications
// ============================================================

export async function createNotification(data: {
  task_id: number;
  execution_id?: number;
  type: string;
  title: string;
  summary?: string;
}): Promise<number> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `INSERT INTO task_notifications (task_id, execution_id, type, title, summary)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      data.task_id,
      data.execution_id || null,
      data.type,
      data.title,
      data.summary || null,
    ],
  );
  return res.rows[0].id as number;
}

export async function getUnreadNotifications(
  limit = 50,
): Promise<TaskNotification[]> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `SELECT n.*, t.name as task_name
     FROM task_notifications n
     LEFT JOIN scheduled_tasks t ON t.id = n.task_id
     WHERE n.read = false
     ORDER BY n.created_at DESC LIMIT $1`,
    [limit],
  );
  return res.rows.map(rowToNotification);
}

export async function getAllNotifications(
  limit = 100,
): Promise<TaskNotification[]> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `SELECT n.*, t.name as task_name
     FROM task_notifications n
     LEFT JOIN scheduled_tasks t ON t.id = n.task_id
     ORDER BY n.created_at DESC LIMIT $1`,
    [limit],
  );
  return res.rows.map(rowToNotification);
}

export async function markNotificationsRead(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await ensureSchedulerTables();
  await getPool().query(
    `UPDATE task_notifications SET read = true WHERE id = ANY($1)`,
    [ids],
  );
}

export async function markAllNotificationsRead(): Promise<void> {
  await ensureSchedulerTables();
  await getPool().query(
    `UPDATE task_notifications SET read = true WHERE read = false`,
  );
}

// ============================================================
// CRUD — task_execution_files
// ============================================================

export interface ExecutionFile {
  id: number;
  execution_id: number;
  file_id: string;
  filename: string;
  media_type: string;
  size_bytes: number | null;
  created_at: string;
}

export async function insertExecutionFile(data: {
  executionId: number;
  fileId: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
}): Promise<number> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `INSERT INTO task_execution_files (execution_id, file_id, filename, media_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [data.executionId, data.fileId, data.filename, data.mediaType, data.sizeBytes],
  );
  return res.rows[0].id as number;
}

export async function listExecutionFiles(
  executionId: number,
): Promise<ExecutionFile[]> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `SELECT * FROM task_execution_files WHERE execution_id = $1 ORDER BY created_at`,
    [executionId],
  );
  return res.rows.map((r) => ({
    ...r,
    created_at: String(r.created_at),
  })) as ExecutionFile[];
}

export async function listExecutionFilesForTask(
  taskId: number,
  limit = 50,
): Promise<ExecutionFile[]> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `SELECT f.* FROM task_execution_files f
     JOIN task_executions e ON e.id = f.execution_id
     WHERE e.task_id = $1
     ORDER BY f.created_at DESC LIMIT $2`,
    [taskId, limit],
  );
  return res.rows.map((r) => ({
    ...r,
    created_at: String(r.created_at),
  })) as ExecutionFile[];
}

export async function getExecutionFile(
  fileId: string,
): Promise<ExecutionFile | null> {
  await ensureSchedulerTables();
  const res = await getPool().query(
    `SELECT * FROM task_execution_files WHERE file_id = $1`,
    [fileId],
  );
  return res.rows.length > 0
    ? ({ ...res.rows[0], created_at: String(res.rows[0].created_at) } as ExecutionFile)
    : null;
}
