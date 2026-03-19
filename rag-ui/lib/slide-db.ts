import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";

// Lazy singleton pool
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

export async function ensureSlideTables(): Promise<void> {
  if (tablesReady) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS slide_decks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        question TEXT,
        answer TEXT,
        plan_md TEXT,
        style_options JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_slide_decks_created ON slide_decks(created_at DESC)`,
    );
    // v2 columns
    await client.query(`ALTER TABLE slide_decks ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1`);
    await client.query(`ALTER TABLE slide_decks ADD COLUMN IF NOT EXISTS conversation_id TEXT`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_slide_decks_conv ON slide_decks(conversation_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS slide_pages (
        id SERIAL PRIMARY KEY,
        deck_id INTEGER REFERENCES slide_decks(id) ON DELETE CASCADE,
        slide_index INTEGER NOT NULL,
        title TEXT,
        slide_type VARCHAR(20) DEFAULT 'content',
        html TEXT NOT NULL,
        plan_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_slide_pages_deck ON slide_pages(deck_id)`,
    );

    // Version history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS slide_page_versions (
        id SERIAL PRIMARY KEY,
        deck_id INTEGER NOT NULL REFERENCES slide_decks(id) ON DELETE CASCADE,
        slide_index INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        title TEXT,
        slide_type VARCHAR(20) DEFAULT 'content',
        html TEXT NOT NULL,
        plan_text TEXT,
        operation VARCHAR(20) DEFAULT 'initial',
        operation_detail JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(deck_id, slide_index, version)
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_spv_deck ON slide_page_versions(deck_id, slide_index)`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS slide_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        position VARCHAR(20) NOT NULL,
        html TEXT NOT NULL,
        header_color VARCHAR(20),
        footer_color VARCHAR(20),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, position)
      )
    `);
    tablesReady = true;
  } finally {
    client.release();
  }
}

// ============================================================
// Slide Deck CRUD
// ============================================================

export async function saveSlideDeck(data: {
  title: string;
  question?: string;
  answer?: string;
  plan_md?: string;
  style_options?: Record<string, string | undefined>;
  conversation_id?: string;
  slides: {
    slide_index: number;
    title?: string;
    slide_type?: string;
    html: string;
    plan_text?: string;
  }[];
}): Promise<number> {
  await ensureSlideTables();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(
      `INSERT INTO slide_decks (title, question, answer, plan_md, style_options, conversation_id, current_version)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 1)
       RETURNING id`,
      [
        data.title,
        data.question || null,
        data.answer || null,
        data.plan_md || null,
        JSON.stringify(data.style_options || {}),
        data.conversation_id || null,
      ],
    );
    const deckId = res.rows[0].id as number;

    for (const slide of data.slides) {
      await client.query(
        `INSERT INTO slide_pages (deck_id, slide_index, title, slide_type, html, plan_text)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          deckId,
          slide.slide_index,
          slide.title || null,
          slide.slide_type || "content",
          slide.html,
          slide.plan_text || null,
        ],
      );
      // Also write initial version
      await client.query(
        `INSERT INTO slide_page_versions (deck_id, slide_index, version, title, slide_type, html, plan_text, operation)
         VALUES ($1, $2, 1, $3, $4, $5, $6, 'initial')`,
        [
          deckId,
          slide.slide_index,
          slide.title || null,
          slide.slide_type || "content",
          slide.html,
          slide.plan_text || null,
        ],
      );
    }
    await client.query("COMMIT");
    return deckId;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function updateSlideDeck(
  deckId: number,
  data: {
    slides: {
      slide_index: number;
      title?: string;
      slide_type?: string;
      html: string;
      plan_text?: string;
    }[];
    style_options?: Record<string, string | undefined>;
  },
): Promise<void> {
  await ensureSlideTables();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    if (data.style_options !== undefined) {
      await client.query(
        `UPDATE slide_decks SET style_options = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [JSON.stringify(data.style_options), deckId],
      );
    } else {
      await client.query(
        `UPDATE slide_decks SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [deckId],
      );
    }

    await client.query(`DELETE FROM slide_pages WHERE deck_id = $1`, [deckId]);

    for (const slide of data.slides) {
      await client.query(
        `INSERT INTO slide_pages (deck_id, slide_index, title, slide_type, html, plan_text)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          deckId,
          slide.slide_index,
          slide.title || null,
          slide.slide_type || "content",
          slide.html,
          slide.plan_text || null,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getSlideDeckHistory(
  limit = 50,
  offset = 0,
): Promise<
  {
    id: number;
    title: string;
    question?: string;
    slide_count: number;
    style_options?: Record<string, string>;
    created_at: string;
    updated_at: string;
  }[]
> {
  await ensureSlideTables();
  const res = await getPool().query(
    `SELECT d.id, d.title, d.question, d.style_options, d.created_at, d.updated_at,
            COUNT(p.id)::int as slide_count,
            (SELECT p2.html FROM slide_pages p2 WHERE p2.deck_id = d.id ORDER BY p2.slide_index LIMIT 1) as first_slide_html
     FROM slide_decks d
     LEFT JOIN slide_pages p ON p.deck_id = d.id
     GROUP BY d.id
     ORDER BY d.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return res.rows.map((r) => ({
    ...r,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

export async function getSlideDeckDetail(deckId: number) {
  await ensureSlideTables();
  const deckRes = await getPool().query(
    `SELECT * FROM slide_decks WHERE id = $1`,
    [deckId],
  );
  if (deckRes.rows.length === 0) return null;

  const deck = deckRes.rows[0];
  const slidesRes = await getPool().query(
    `SELECT slide_index, title, slide_type, html, plan_text
     FROM slide_pages WHERE deck_id = $1 ORDER BY slide_index`,
    [deckId],
  );

  return {
    id: deck.id,
    title: deck.title,
    question: deck.question,
    answer: deck.answer,
    plan_md: deck.plan_md,
    style_options: deck.style_options,
    current_version: deck.current_version ?? 1,
    conversation_id: deck.conversation_id ?? null,
    slides: slidesRes.rows,
    created_at: String(deck.created_at),
    updated_at: String(deck.updated_at),
  };
}

export async function renameSlideDeck(
  deckId: number,
  newTitle: string,
): Promise<void> {
  await ensureSlideTables();
  await getPool().query(
    `UPDATE slide_decks SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [newTitle, deckId],
  );
}

export async function deleteSlideDeck(deckId: number): Promise<void> {
  await ensureSlideTables();
  await getPool().query(`DELETE FROM slide_decks WHERE id = $1`, [deckId]);
}

export async function duplicateSlideDeck(deckId: number): Promise<number> {
  await ensureSlideTables();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(
      `INSERT INTO slide_decks (title, question, answer, plan_md, style_options)
       SELECT 'コピー - ' || title, question, answer, plan_md, style_options
       FROM slide_decks WHERE id = $1
       RETURNING id`,
      [deckId],
    );
    if (res.rows.length === 0) throw new Error("Deck not found");
    const newId = res.rows[0].id as number;
    await client.query(
      `INSERT INTO slide_pages (deck_id, slide_index, title, slide_type, html, plan_text)
       SELECT $1, slide_index, title, slide_type, html, plan_text
       FROM slide_pages WHERE deck_id = $2 ORDER BY slide_index`,
      [newId, deckId],
    );
    await client.query("COMMIT");
    return newId;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
// Version Management
// ============================================================

/** Get the active deck for a given conversation */
export async function getActiveDeckForConversation(
  conversationId: string,
): Promise<number | null> {
  await ensureSlideTables();
  const res = await getPool().query(
    `SELECT id FROM slide_decks WHERE conversation_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [conversationId],
  );
  return res.rows.length > 0 ? (res.rows[0].id as number) : null;
}

/** Update a single slide + bump version + write version record */
export async function updateSlideAndVersion(
  deckId: number,
  slideIndex: number,
  newHtml: string,
  operation: string,
  detail: Record<string, unknown> = {},
  newTitle?: string,
): Promise<number> {
  await ensureSlideTables();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // Bump version
    const vRes = await client.query(
      `UPDATE slide_decks SET current_version = current_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING current_version`,
      [deckId],
    );
    const newVersion = vRes.rows[0].current_version as number;

    // Update slide_pages
    if (newTitle !== undefined) {
      await client.query(
        `UPDATE slide_pages SET html = $1, title = $2 WHERE deck_id = $3 AND slide_index = $4`,
        [newHtml, newTitle, deckId, slideIndex],
      );
    } else {
      await client.query(
        `UPDATE slide_pages SET html = $1 WHERE deck_id = $2 AND slide_index = $3`,
        [newHtml, deckId, slideIndex],
      );
    }

    // Get current slide metadata for version record
    const slideRow = await client.query(
      `SELECT title, slide_type, plan_text FROM slide_pages WHERE deck_id = $1 AND slide_index = $2`,
      [deckId, slideIndex],
    );
    const slide = slideRow.rows[0];

    // Write version record
    await client.query(
      `INSERT INTO slide_page_versions (deck_id, slide_index, version, title, slide_type, html, plan_text, operation, operation_detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        deckId,
        slideIndex,
        newVersion,
        slide?.title || null,
        slide?.slide_type || "content",
        newHtml,
        slide?.plan_text || null,
        operation,
        JSON.stringify(detail),
      ],
    );

    await client.query("COMMIT");
    return newVersion;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Get version history for a deck: list of versions with metadata */
export async function getSlideVersions(deckId: number) {
  await ensureSlideTables();
  const res = await getPool().query(
    `SELECT version, operation, operation_detail, created_at, COUNT(*)::int as slide_count
     FROM slide_page_versions WHERE deck_id = $1
     GROUP BY version, operation, operation_detail, created_at
     ORDER BY version DESC`,
    [deckId],
  );
  return res.rows.map((r) => ({
    version: r.version as number,
    operation: r.operation as string,
    operation_detail: r.operation_detail ?? {},
    slide_count: r.slide_count as number,
    created_at: String(r.created_at),
  }));
}

/** Get slides at a specific version */
export async function getSlidesAtVersion(deckId: number, version: number) {
  await ensureSlideTables();
  const res = await getPool().query(
    `SELECT slide_index, title, slide_type, html, plan_text
     FROM slide_page_versions WHERE deck_id = $1 AND version = $2
     ORDER BY slide_index`,
    [deckId, version],
  );
  return res.rows;
}

/** Restore deck to a specific version: copies that version's slides to slide_pages + creates new version */
export async function restoreDeckToVersion(
  deckId: number,
  targetVersion: number,
): Promise<number> {
  await ensureSlideTables();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // Get slides at target version
    const oldSlides = await client.query(
      `SELECT slide_index, title, slide_type, html, plan_text
       FROM slide_page_versions WHERE deck_id = $1 AND version = $2
       ORDER BY slide_index`,
      [deckId, targetVersion],
    );
    if (oldSlides.rows.length === 0) throw new Error("Version not found");

    // Bump version
    const vRes = await client.query(
      `UPDATE slide_decks SET current_version = current_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING current_version`,
      [deckId],
    );
    const newVersion = vRes.rows[0].current_version as number;

    // Replace slide_pages
    await client.query(`DELETE FROM slide_pages WHERE deck_id = $1`, [deckId]);
    for (const slide of oldSlides.rows) {
      await client.query(
        `INSERT INTO slide_pages (deck_id, slide_index, title, slide_type, html, plan_text)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [deckId, slide.slide_index, slide.title, slide.slide_type, slide.html, slide.plan_text],
      );
      // Write version record
      await client.query(
        `INSERT INTO slide_page_versions (deck_id, slide_index, version, title, slide_type, html, plan_text, operation, operation_detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'restore', $8::jsonb)`,
        [
          deckId,
          slide.slide_index,
          newVersion,
          slide.title,
          slide.slide_type,
          slide.html,
          slide.plan_text,
          JSON.stringify({ restoredFrom: targetVersion }),
        ],
      );
    }

    await client.query("COMMIT");
    return newVersion;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
// Slide Template CRUD
// ============================================================

export async function saveSlideTemplate(data: {
  name: string;
  position: string;
  html: string;
  header_color?: string;
  footer_color?: string;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  await ensureSlideTables();
  const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;

  const res = await getPool().query(
    `INSERT INTO slide_templates (name, position, html, header_color, footer_color, metadata)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, '{}')::jsonb)
     ON CONFLICT (name, position) DO UPDATE SET
       html = EXCLUDED.html,
       header_color = EXCLUDED.header_color,
       footer_color = EXCLUDED.footer_color,
       metadata = EXCLUDED.metadata
     RETURNING id`,
    [
      data.name,
      data.position,
      data.html,
      data.header_color || null,
      data.footer_color || null,
      metadataJson,
    ],
  );
  return res.rows[0].id as number;
}

export async function getSlideTemplates() {
  await ensureSlideTables();
  const res = await getPool().query(
    `SELECT * FROM slide_templates ORDER BY position, name`,
  );
  return res.rows.map((r) => ({
    ...r,
    created_at: String(r.created_at),
  }));
}

export async function deleteSlideTemplate(templateId: number): Promise<void> {
  await ensureSlideTables();
  await getPool().query(`DELETE FROM slide_templates WHERE id = $1`, [
    templateId,
  ]);
}
