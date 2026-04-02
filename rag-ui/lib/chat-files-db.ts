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

export async function ensureChatFilesTables(): Promise<void> {
  if (tablesReady) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_files (
        id TEXT PRIMARY KEY,
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

export interface ChatFileRow {
  id: string;
  original_name: string;
  stored_path: string;
  media_type: string;
  size_bytes: number;
  created_at: string;
}

export async function insertChatFile(file: {
  id: string;
  originalName: string;
  storedPath: string;
  mediaType: string;
  sizeBytes: number;
}): Promise<void> {
  await ensureChatFilesTables();
  await getPool().query(
    `INSERT INTO chat_files (id, original_name, stored_path, media_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      file.id,
      file.originalName,
      file.storedPath,
      file.mediaType,
      file.sizeBytes,
    ],
  );
}

export async function getChatFile(id: string): Promise<ChatFileRow | null> {
  await ensureChatFilesTables();
  const res = await getPool().query(`SELECT * FROM chat_files WHERE id = $1`, [
    id,
  ]);
  if (res.rows.length === 0) return null;
  return res.rows[0];
}

/**
 * Find all file IDs referenced in a conversation's messages.
 * Uses regex on full parts JSONB text to catch references at any nesting
 * level (e.g. user uploads as top-level file parts AND generateImage tool
 * results where URLs are nested inside result.images[].url).
 */
export async function getFileIdsByConversation(
  conversationId: string,
): Promise<string[]> {
  await ensureChatFilesTables();
  const res = await getPool().query(
    `SELECT DISTINCT m[1] AS file_id
     FROM chat_messages,
       regexp_matches(parts::text, '/api/files/([A-Za-z0-9_-]+)', 'g') AS m
     WHERE conversation_id = $1`,
    [conversationId],
  );
  return res.rows.map((r) => r.file_id).filter(Boolean);
}

/**
 * Delete file records by IDs. Returns stored_path list for disk cleanup.
 */
export async function deleteChatFiles(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  await ensureChatFilesTables();
  const res = await getPool().query(
    `DELETE FROM chat_files WHERE id = ANY($1) RETURNING stored_path`,
    [ids],
  );
  return res.rows.map((r) => r.stored_path);
}

/**
 * Find orphan files: uploaded over `maxAgeMinutes` ago but not referenced
 * in any chat_messages parts or task_execution_files.
 * Returns empty array if chat_messages table doesn't exist yet.
 */
export async function getOrphanFiles(
  maxAgeMinutes = 60,
): Promise<ChatFileRow[]> {
  await ensureChatFilesTables();
  // Check if chat_messages table exists (created lazily on first chat)
  const tableCheck = await getPool().query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_name = 'chat_messages' LIMIT 1`,
  );
  if (tableCheck.rows.length === 0) return [];

  // Check if task_execution_files table exists
  const taskTableCheck = await getPool().query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_name = 'task_execution_files' LIMIT 1`,
  );
  const hasTaskFiles = taskTableCheck.rows.length > 0;

  // Build the file-reference pattern to match in JSONB text
  // Tool results store URLs nested (e.g. generateImage result.images[].url),
  // so a top-level p->>'url' check misses them. Use textual LIKE on the full
  // parts JSONB to catch any /api/files/{id} reference regardless of nesting.
  const res = await getPool().query(
    `SELECT cf.*
     FROM chat_files cf
     WHERE cf.created_at < NOW() - INTERVAL '1 minute' * $1
       AND NOT EXISTS (
         SELECT 1 FROM chat_messages cm
         WHERE cm.parts::text LIKE '%/api/files/' || cf.id || '%'
       )
       ${hasTaskFiles ? `AND NOT EXISTS (
         SELECT 1 FROM task_execution_files tef
         WHERE tef.file_id = cf.id
       )` : ""}`,
    [maxAgeMinutes],
  );
  return res.rows;
}
