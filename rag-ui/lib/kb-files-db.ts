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

export async function ensureKbFilesTables(): Promise<void> {
  if (tablesReady) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS kb_files (
        id TEXT PRIMARY KEY,
        doc_id TEXT NOT NULL UNIQUE,
        kb_slug TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        media_type TEXT NOT NULL,
        size_bytes BIGINT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    tablesReady = true;
  } finally {
    client.release();
  }
}

export interface KbFileRow {
  id: string;
  doc_id: string;
  kb_slug: string;
  original_name: string;
  stored_path: string;
  media_type: string;
  size_bytes: number;
  created_at: string;
}

export async function insertKbFile(file: {
  id: string;
  docId: string;
  kbSlug: string;
  originalName: string;
  storedPath: string;
  mediaType: string;
  sizeBytes: number;
}): Promise<void> {
  await ensureKbFilesTables();
  await getPool().query(
    `INSERT INTO kb_files (id, doc_id, kb_slug, original_name, stored_path, media_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      file.id,
      file.docId,
      file.kbSlug,
      file.originalName,
      file.storedPath,
      file.mediaType,
      file.sizeBytes,
    ],
  );
}

export async function getKbFile(id: string): Promise<KbFileRow | null> {
  await ensureKbFilesTables();
  const res = await getPool().query(
    `SELECT * FROM kb_files WHERE id = $1`,
    [id],
  );
  if (res.rows.length === 0) return null;
  return res.rows[0];
}

export async function getKbFileByDocId(
  docId: string,
): Promise<KbFileRow | null> {
  await ensureKbFilesTables();
  const res = await getPool().query(
    `SELECT * FROM kb_files WHERE doc_id = $1`,
    [docId],
  );
  if (res.rows.length === 0) return null;
  return res.rows[0];
}

export async function getKbFilesByDocIds(
  docIds: string[],
): Promise<Record<string, KbFileRow>> {
  if (docIds.length === 0) return {};
  await ensureKbFilesTables();
  const res = await getPool().query(
    `SELECT * FROM kb_files WHERE doc_id = ANY($1)`,
    [docIds],
  );
  const map: Record<string, KbFileRow> = {};
  for (const row of res.rows) {
    map[row.doc_id] = row;
  }
  return map;
}

export async function deleteKbFile(id: string): Promise<string | null> {
  await ensureKbFilesTables();
  const res = await getPool().query(
    `DELETE FROM kb_files WHERE id = $1 RETURNING stored_path`,
    [id],
  );
  if (res.rows.length === 0) return null;
  return res.rows[0].stored_path;
}

export async function deleteKbFilesByKb(kbSlug: string): Promise<string[]> {
  await ensureKbFilesTables();
  const res = await getPool().query(
    `DELETE FROM kb_files WHERE kb_slug = $1 RETURNING stored_path`,
    [kbSlug],
  );
  return res.rows.map((r: { stored_path: string }) => r.stored_path);
}
