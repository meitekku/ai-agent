import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";

// Lazy singleton pool (shared connection string with skills-db / slide-db)
let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  }
  return pool;
}

// ============================================================
// Schema — CREATE TABLE IF NOT EXISTS
// ============================================================

let tablesReady = false;

export async function ensureChatTables(): Promise<void> {
  if (tablesReady) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        active_leaf_id TEXT,
        kb_slug VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Add kb_slug column if missing (existing deployments)
    await client.query(`
      ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS kb_slug VARCHAR(100)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_conv_updated
        ON chat_conversations(updated_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL
          REFERENCES chat_conversations(id) ON DELETE CASCADE,
        parent_id TEXT,
        role VARCHAR(20) NOT NULL,
        parts JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_msg_conv
        ON chat_messages(conversation_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_msg_parent
        ON chat_messages(parent_id)
    `);
    // Add stopped column if missing (existing deployments)
    await client.query(`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS stopped BOOLEAN DEFAULT FALSE
    `);
    // Add chat_model / thinking columns if missing (existing deployments)
    await client.query(`
      ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS chat_model VARCHAR(100)
    `);
    await client.query(`
      ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS thinking BOOLEAN DEFAULT FALSE
    `);
    tablesReady = true;
  } finally {
    client.release();
  }
}

// ============================================================
// Types
// ============================================================

export interface ConversationRow {
  id: string;
  title: string;
  active_leaf_id: string | null;
  kb_slug: string | null;
  chat_model: string | null;
  thinking: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationListItem {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: string;
  parts: unknown[];
  stopped: boolean;
  created_at: string;
}

// ============================================================
// CRUD
// ============================================================

export async function createConversation(
  id: string,
  title: string,
  kbSlug?: string | null,
  chatModel?: string | null,
  thinking?: boolean,
): Promise<void> {
  await ensureChatTables();
  await getPool().query(
    `INSERT INTO chat_conversations (id, title, kb_slug, chat_model, thinking) VALUES ($1, $2, $3, $4, $5)`,
    [id, title, kbSlug ?? null, chatModel ?? null, thinking ?? false],
  );
}

export async function listConversations(
  limit = 50,
  offset = 0,
): Promise<ConversationListItem[]> {
  await ensureChatTables();
  const res = await getPool().query(
    `SELECT c.id, c.title, c.updated_at,
            COUNT(m.id)::int AS message_count
     FROM chat_conversations c
     LEFT JOIN chat_messages m ON m.conversation_id = c.id
     GROUP BY c.id
     ORDER BY c.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return res.rows.map((r) => ({
    ...r,
    updated_at: String(r.updated_at),
  }));
}

export async function getConversationTitle(
  id: string,
): Promise<string | null> {
  await ensureChatTables();
  const res = await getPool().query(
    `SELECT title FROM chat_conversations WHERE id = $1`,
    [id],
  );
  return res.rows[0]?.title ?? null;
}

export async function getConversation(id: string): Promise<{
  conversation: ConversationRow;
  messages: MessageRow[];
} | null> {
  await ensureChatTables();
  const convRes = await getPool().query(
    `SELECT * FROM chat_conversations WHERE id = $1`,
    [id],
  );
  if (convRes.rows.length === 0) return null;

  const msgRes = await getPool().query(
    `SELECT * FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [id],
  );

  const conv = convRes.rows[0];
  return {
    conversation: {
      ...conv,
      created_at: String(conv.created_at),
      updated_at: String(conv.updated_at),
    },
    messages: msgRes.rows.map((r) => ({
      ...r,
      created_at: String(r.created_at),
    })),
  };
}

export async function saveMessages(
  conversationId: string,
  messages: {
    id: string;
    parent_id: string | null;
    role: string;
    parts: unknown[];
    stopped?: boolean;
  }[],
): Promise<void> {
  if (messages.length === 0) return;
  await ensureChatTables();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const msg of messages) {
      await client.query(
        `INSERT INTO chat_messages (id, conversation_id, parent_id, role, parts, stopped)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET parts = $5, stopped = $6`,
        [
          msg.id,
          conversationId,
          msg.parent_id,
          msg.role,
          JSON.stringify(msg.parts),
          msg.stopped ?? false,
        ],
      );
    }
    // Update conversation timestamp
    await client.query(
      `UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function updateConversation(
  id: string,
  data: {
    title?: string;
    active_leaf_id?: string | null;
    chat_model?: string | null;
    thinking?: boolean;
  },
): Promise<void> {
  await ensureChatTables();
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.title !== undefined) {
    fields.push(`title = $${idx++}`);
    values.push(data.title);
  }
  if (data.active_leaf_id !== undefined) {
    fields.push(`active_leaf_id = $${idx++}`);
    values.push(data.active_leaf_id);
  }
  if (data.chat_model !== undefined) {
    fields.push(`chat_model = $${idx++}`);
    values.push(data.chat_model);
  }
  if (data.thinking !== undefined) {
    fields.push(`thinking = $${idx++}`);
    values.push(data.thinking);
  }

  if (fields.length === 0) return;

  fields.push(`updated_at = NOW()`);
  values.push(id);

  await getPool().query(
    `UPDATE chat_conversations SET ${fields.join(", ")} WHERE id = $${idx}`,
    values,
  );
}

export async function deleteConversation(id: string): Promise<void> {
  await ensureChatTables();
  await getPool().query(`DELETE FROM chat_conversations WHERE id = $1`, [id]);
}

export async function updateMessage(
  messageId: string,
  conversationId: string,
  data: { parts?: unknown[]; stopped?: boolean },
): Promise<void> {
  await ensureChatTables();
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.parts !== undefined) {
    fields.push(`parts = $${idx++}`);
    values.push(JSON.stringify(data.parts));
  }
  if (data.stopped !== undefined) {
    fields.push(`stopped = $${idx++}`);
    values.push(data.stopped);
  }

  if (fields.length === 0) return;

  values.push(messageId, conversationId);

  await getPool().query(
    `UPDATE chat_messages SET ${fields.join(", ")}
     WHERE id = $${idx} AND conversation_id = $${idx + 1}`,
    values,
  );
}
