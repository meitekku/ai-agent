import { nanoid } from "nanoid";
import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";

let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  }
  return pool;
}

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS proposal_sessions (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      analysis JSONB NOT NULL,
      additional_context TEXT NOT NULL DEFAULT '',
      phase TEXT NOT NULL DEFAULT 'analysis',
      style_options JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Add columns for existing tables (idempotent)
  await p
    .query(`ALTER TABLE proposal_sessions ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'analysis'`)
    .catch(() => {});
  await p
    .query(`ALTER TABLE proposal_sessions ADD COLUMN IF NOT EXISTS style_options JSONB NOT NULL DEFAULT '{}'`)
    .catch(() => {});
  tableReady = true;
}

interface ProposalSession {
  data: Record<string, unknown>;
  analysis: Record<string, unknown>;
  additionalContext: string;
  phase: string;
  styleOptions: Record<string, unknown>;
  createdAt: number;
}

// In-memory cache for hot path (current session)
const cache = new Map<string, ProposalSession>();

export function storeSession(
  data: Record<string, unknown>,
  analysis: Record<string, unknown>,
  additionalContext: string,
): string {
  const key = nanoid(12);
  const session: ProposalSession = {
    data, analysis, additionalContext,
    phase: "analysis", styleOptions: {},
    createdAt: Date.now(),
  };
  cache.set(key, session);

  // Persist to DB (fire-and-forget)
  ensureTable()
    .then(() =>
      getPool().query(
        `INSERT INTO proposal_sessions (key, data, analysis, additional_context)
         VALUES ($1, $2::jsonb, $3::jsonb, $4)
         ON CONFLICT (key) DO UPDATE SET data = $2::jsonb, analysis = $3::jsonb, additional_context = $4`,
        [key, JSON.stringify(data), JSON.stringify(analysis), additionalContext],
      ),
    )
    .catch((err) => console.error("[proposal-session] DB store failed:", err));

  return key;
}

export async function getSession(key: string): Promise<ProposalSession | null> {
  // Check memory cache first
  const cached = cache.get(key);
  if (cached) return cached;

  // Fall back to DB
  try {
    await ensureTable();
    const res = await getPool().query(
      `SELECT data, analysis, additional_context, phase, style_options, created_at FROM proposal_sessions WHERE key = $1`,
      [key],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    const session: ProposalSession = {
      data: row.data,
      analysis: row.analysis,
      additionalContext: row.additional_context || "",
      phase: row.phase || "analysis",
      styleOptions: row.style_options || {},
      createdAt: new Date(row.created_at).getTime(),
    };
    // Warm cache
    cache.set(key, session);
    return session;
  } catch (err) {
    console.error("[proposal-session] DB get failed:", err);
    return null;
  }
}

export function updateSessionAnalysis(
  key: string,
  analysis: Record<string, unknown>,
): boolean {
  const session = cache.get(key);
  if (session) {
    session.analysis = analysis;
  }

  // Update DB (fire-and-forget)
  ensureTable()
    .then(() =>
      getPool().query(
        `UPDATE proposal_sessions SET analysis = $2::jsonb WHERE key = $1`,
        [key, JSON.stringify(analysis)],
      ),
    )
    .catch((err) => console.error("[proposal-session] DB update failed:", err));

  return !!session;
}

export function updateSessionFull(
  key: string,
  analysis: Record<string, unknown>,
  additionalContext: string,
): void {
  const session = cache.get(key);
  if (session) {
    session.analysis = analysis;
    session.additionalContext = additionalContext;
  }

  ensureTable()
    .then(() =>
      getPool().query(
        `UPDATE proposal_sessions SET analysis = $2::jsonb, additional_context = $3 WHERE key = $1`,
        [key, JSON.stringify(analysis), additionalContext],
      ),
    )
    .catch((err) => console.error("[proposal-session] DB update failed:", err));
}

export function updateSessionUI(
  key: string,
  phase: string,
  styleOptions: Record<string, unknown>,
): void {
  const session = cache.get(key);
  if (session) {
    session.phase = phase;
    session.styleOptions = styleOptions;
  }

  // Persist to DB (fire-and-forget)
  ensureTable()
    .then(() =>
      getPool().query(
        `UPDATE proposal_sessions SET phase = $2, style_options = $3::jsonb WHERE key = $1`,
        [key, phase, JSON.stringify(styleOptions)],
      ),
    )
    .catch((err) => console.error("[proposal-session] DB UI update failed:", err));
}
