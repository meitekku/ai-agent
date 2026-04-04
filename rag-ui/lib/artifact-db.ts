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

// ============================================================
// Schema
// ============================================================

let tablesReady = false;

export async function ensureArtifactTables(): Promise<void> {
  if (tablesReady) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        kind VARCHAR(30) NOT NULL DEFAULT 'html',
        title TEXT NOT NULL DEFAULT '',
        current_version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_conv ON artifacts(conversation_id);

      CREATE TABLE IF NOT EXISTS artifact_versions (
        artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        command VARCHAR(20) NOT NULL DEFAULT 'create',
        description TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (artifact_id, version)
      );
    `);
    tablesReady = true;
  } finally {
    client.release();
  }
}

// ============================================================
// Types
// ============================================================

export interface Artifact {
  id: string;
  conversationId: string;
  kind: string;
  title: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactVersion {
  artifactId: string;
  version: number;
  content: string;
  command: string;
  description: string;
  createdAt: string;
}

// ============================================================
// CRUD
// ============================================================

export async function createArtifact(
  id: string,
  conversationId: string,
  kind: string,
  title: string,
  content: string,
): Promise<void> {
  await ensureArtifactTables();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO artifacts (id, conversation_id, kind, title, current_version)
       VALUES ($1, $2, $3, $4, 1)`,
      [id, conversationId, kind, title],
    );
    await client.query(
      `INSERT INTO artifact_versions (artifact_id, version, content, command, description)
       VALUES ($1, 1, $2, 'create', $3)`,
      [id, content, ""],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

function rowToArtifact(r: Record<string, unknown>): Artifact {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    kind: r.kind as string,
    title: r.title as string,
    currentVersion: r.current_version as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function getArtifact(id: string): Promise<Artifact | null> {
  await ensureArtifactTables();
  const { rows } = await getPool().query(
    `SELECT id, conversation_id, kind, title, current_version, created_at, updated_at
     FROM artifacts WHERE id = $1`,
    [id],
  );
  return rows.length > 0 ? rowToArtifact(rows[0]) : null;
}

export async function getArtifactByConversation(
  conversationId: string,
): Promise<Artifact | null> {
  await ensureArtifactTables();
  const { rows } = await getPool().query(
    `SELECT id, conversation_id, kind, title, current_version, created_at, updated_at
     FROM artifacts WHERE conversation_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [conversationId],
  );
  return rows.length > 0 ? rowToArtifact(rows[0]) : null;
}

export async function listArtifactsByConversation(
  conversationId: string,
): Promise<Artifact[]> {
  await ensureArtifactTables();
  const { rows } = await getPool().query(
    `SELECT id, conversation_id, kind, title, current_version, created_at, updated_at
     FROM artifacts WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId],
  );
  return rows.map(rowToArtifact);
}

export async function getCurrentContent(
  artifactId: string,
): Promise<string | null> {
  await ensureArtifactTables();
  const { rows } = await getPool().query(
    `SELECT av.content FROM artifact_versions av
     JOIN artifacts a ON a.id = av.artifact_id AND av.version = a.current_version
     WHERE av.artifact_id = $1`,
    [artifactId],
  );
  return rows.length > 0 ? rows[0].content : null;
}

export async function createArtifactVersion(
  artifactId: string,
  version: number,
  content: string,
  command: string,
  description: string,
): Promise<void> {
  await ensureArtifactTables();
  await getPool().query(
    `INSERT INTO artifact_versions (artifact_id, version, content, command, description)
     VALUES ($1, $2, $3, $4, $5)`,
    [artifactId, version, content, command, description],
  );
}

export async function updateArtifactMeta(
  id: string,
  updates: { title?: string; kind?: string; currentVersion?: number },
): Promise<void> {
  await ensureArtifactTables();
  const sets: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  let idx = 1;

  if (updates.title !== undefined) {
    sets.push(`title = $${idx++}`);
    vals.push(updates.title);
  }
  if (updates.kind !== undefined) {
    sets.push(`kind = $${idx++}`);
    vals.push(updates.kind);
  }
  if (updates.currentVersion !== undefined) {
    sets.push(`current_version = $${idx++}`);
    vals.push(updates.currentVersion);
  }

  vals.push(id);
  await getPool().query(
    `UPDATE artifacts SET ${sets.join(", ")} WHERE id = $${idx}`,
    vals,
  );
}

export async function getArtifactVersion(
  artifactId: string,
  version: number,
): Promise<ArtifactVersion | null> {
  await ensureArtifactTables();
  const { rows } = await getPool().query(
    `SELECT artifact_id, version, content, command, description, created_at
     FROM artifact_versions WHERE artifact_id = $1 AND version = $2`,
    [artifactId, version],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    artifactId: r.artifact_id,
    version: r.version,
    content: r.content,
    command: r.command,
    description: r.description,
    createdAt: r.created_at,
  };
}

export async function listVersions(
  artifactId: string,
): Promise<{ version: number; command: string; description: string; createdAt: string }[]> {
  await ensureArtifactTables();
  const { rows } = await getPool().query(
    `SELECT version, command, description, created_at
     FROM artifact_versions WHERE artifact_id = $1 ORDER BY version ASC`,
    [artifactId],
  );
  return rows.map((r) => ({
    version: r.version,
    command: r.command,
    description: r.description,
    createdAt: r.created_at,
  }));
}
