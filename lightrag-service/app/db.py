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
    await _pool.execute("""
        CREATE TABLE IF NOT EXISTS ingest_jobs (
            doc_id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(500) NOT NULL,
            page_count INTEGER DEFAULT 0,
            track_id VARCHAR(255),
            status VARCHAR(64) DEFAULT 'processing',
            error_msg TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)


async def save_job(doc_id: str, name: str, page_count: int, track_id: str, *, status: str = "processing"):
    await _pool.execute(
        """INSERT INTO ingest_jobs (doc_id, name, page_count, track_id, status)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (doc_id) DO NOTHING""",
        doc_id, name, page_count, track_id, status,
    )


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


async def fetch_all_jobs() -> list[dict]:
    rows = await _pool.fetch(
        "SELECT doc_id, name, page_count, track_id, status, error_msg, created_at FROM ingest_jobs ORDER BY created_at DESC"
    )
    return [dict(r) for r in rows]


async def get_job(doc_id: str) -> dict | None:
    row = await _pool.fetchrow(
        "SELECT doc_id, name, track_id, status FROM ingest_jobs WHERE doc_id = $1",
        doc_id,
    )
    return dict(row) if row else None


async def delete_job(doc_id: str) -> bool:
    result = await _pool.execute("DELETE FROM ingest_jobs WHERE doc_id = $1", doc_id)
    return result == "DELETE 1"


async def get_processing_jobs() -> list[dict]:
    rows = await _pool.fetch(
        "SELECT doc_id, name, track_id FROM ingest_jobs WHERE status = 'processing'"
    )
    return [dict(r) for r in rows]
