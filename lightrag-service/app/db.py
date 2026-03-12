import asyncpg
from . import config

_pool: asyncpg.Pool | None = None


async def init_db():
    global _pool
    _pool = await asyncpg.create_pool(
        host=config.PG_HOST,
        port=config.PG_PORT,
        user=config.PG_USER,
        password=config.PG_PASSWORD,
        database=config.PG_DATABASE,
        min_size=1,
        max_size=5,
    )
    # Knowledge bases table
    await _pool.execute("""
        CREATE TABLE IF NOT EXISTS knowledge_bases (
            slug VARCHAR(100) PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            title VARCHAR(200) DEFAULT '',
            description TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Ingest jobs table
    await _pool.execute("""
        CREATE TABLE IF NOT EXISTS ingest_jobs (
            doc_id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(500) NOT NULL,
            kb_slug VARCHAR(100) NOT NULL,
            page_count INTEGER DEFAULT 0,
            track_id VARCHAR(255),
            status VARCHAR(64) DEFAULT 'processing',
            error_msg TEXT,
            file_hash VARCHAR(64),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    await _pool.execute("""
        CREATE INDEX IF NOT EXISTS idx_ingest_jobs_kb
            ON ingest_jobs(kb_slug)
    """)


# ---------------------------------------------------------------------------
# Knowledge Bases CRUD
# ---------------------------------------------------------------------------

async def list_kbs() -> list[dict]:
    rows = await _pool.fetch("""
        SELECT kb.slug, kb.name, kb.title, kb.description,
               kb.created_at, kb.updated_at,
               COUNT(ij.doc_id)::int AS doc_count
        FROM knowledge_bases kb
        LEFT JOIN ingest_jobs ij ON ij.kb_slug = kb.slug
        GROUP BY kb.slug
        ORDER BY kb.created_at DESC
    """)
    return [dict(r) for r in rows]


async def create_kb(slug: str, name: str, title: str = "", description: str = "") -> dict:
    await _pool.execute(
        """INSERT INTO knowledge_bases (slug, name, title, description)
           VALUES ($1, $2, $3, $4)""",
        slug, name, title, description,
    )
    return {"slug": slug, "name": name, "title": title, "description": description}


async def get_kb(slug: str) -> dict | None:
    row = await _pool.fetchrow(
        "SELECT slug, name, title, description, created_at, updated_at FROM knowledge_bases WHERE slug = $1",
        slug,
    )
    return dict(row) if row else None


async def update_kb(slug: str, **kwargs) -> bool:
    fields = []
    values = []
    idx = 1
    for key in ("name", "title", "description"):
        if key in kwargs:
            fields.append(f"{key} = ${idx}")
            values.append(kwargs[key])
            idx += 1
    if not fields:
        return False
    fields.append("updated_at = CURRENT_TIMESTAMP")
    values.append(slug)
    result = await _pool.execute(
        f"UPDATE knowledge_bases SET {', '.join(fields)} WHERE slug = ${idx}",
        *values,
    )
    return result == "UPDATE 1"


async def delete_kb(slug: str) -> bool:
    result = await _pool.execute("DELETE FROM knowledge_bases WHERE slug = $1", slug)
    return result == "DELETE 1"


# ---------------------------------------------------------------------------
# Ingest Jobs CRUD (with kb_slug)
# ---------------------------------------------------------------------------

async def save_job(doc_id: str, name: str, kb_slug: str, page_count: int, track_id: str, *, status: str = "processing", file_hash: str | None = None):
    await _pool.execute(
        """INSERT INTO ingest_jobs (doc_id, name, kb_slug, page_count, track_id, status, file_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (doc_id) DO NOTHING""",
        doc_id, name, kb_slug, page_count, track_id, status, file_hash,
    )


async def find_by_hash(file_hash: str, kb_slug: str) -> dict | None:
    row = await _pool.fetchrow(
        "SELECT doc_id, name, status FROM ingest_jobs WHERE file_hash = $1 AND kb_slug = $2 AND status != 'failed' LIMIT 1",
        file_hash, kb_slug,
    )
    return dict(row) if row else None


async def find_by_name(name: str, kb_slug: str) -> dict | None:
    row = await _pool.fetchrow(
        "SELECT doc_id, name, status FROM ingest_jobs WHERE name = $1 AND kb_slug = $2 AND status != 'failed' LIMIT 1",
        name, kb_slug,
    )
    return dict(row) if row else None


async def update_job_after_ocr(doc_id: str, page_count: int, track_id: str):
    await _pool.execute(
        """UPDATE ingest_jobs SET page_count = $1, track_id = $2, status = 'processing', updated_at = CURRENT_TIMESTAMP
           WHERE doc_id = $3""",
        page_count, track_id, doc_id,
    )


async def update_job_status(doc_id: str, status: str, error_msg: str | None = None):
    await _pool.execute(
        """UPDATE ingest_jobs SET status = $1, error_msg = $2, updated_at = CURRENT_TIMESTAMP
           WHERE doc_id = $3""",
        status, error_msg, doc_id,
    )


async def fetch_all_jobs(kb_slug: str) -> list[dict]:
    rows = await _pool.fetch(
        "SELECT doc_id, name, page_count, track_id, status, error_msg, created_at FROM ingest_jobs WHERE kb_slug = $1 ORDER BY created_at DESC",
        kb_slug,
    )
    return [dict(r) for r in rows]


async def get_job(doc_id: str) -> dict | None:
    row = await _pool.fetchrow(
        "SELECT doc_id, name, kb_slug, track_id, status FROM ingest_jobs WHERE doc_id = $1",
        doc_id,
    )
    return dict(row) if row else None


async def delete_job(doc_id: str) -> bool:
    result = await _pool.execute("DELETE FROM ingest_jobs WHERE doc_id = $1", doc_id)
    return result == "DELETE 1"


async def delete_jobs_by_kb(kb_slug: str) -> int:
    result = await _pool.execute("DELETE FROM ingest_jobs WHERE kb_slug = $1", kb_slug)
    # result is like "DELETE 5"
    try:
        return int(result.split()[-1])
    except (ValueError, IndexError):
        return 0


async def get_processing_jobs() -> list[dict]:
    rows = await _pool.fetch(
        "SELECT doc_id, name, kb_slug, track_id FROM ingest_jobs WHERE status = 'processing'"
    )
    return [dict(r) for r in rows]


async def get_stale_jobs() -> list[dict]:
    """Find all non-terminal jobs (anything not processed/failed)."""
    rows = await _pool.fetch(
        "SELECT doc_id, name, kb_slug, track_id, status FROM ingest_jobs "
        "WHERE status NOT IN ('processed', 'failed')"
    )
    return [dict(r) for r in rows]
