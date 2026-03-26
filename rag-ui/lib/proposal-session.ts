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
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS proposal_sessions (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      analysis JSONB NOT NULL,
      additional_context TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  tableReady = true;
}

interface ProposalSession {
  data: Record<string, unknown>;
  analysis: Record<string, unknown>;
  additionalContext: string;
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
  const session: ProposalSession = { data, analysis, additionalContext, createdAt: Date.now() };
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
      `SELECT data, analysis, additional_context, created_at FROM proposal_sessions WHERE key = $1`,
      [key],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    const session: ProposalSession = {
      data: row.data,
      analysis: row.analysis,
      additionalContext: row.additional_context || "",
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
