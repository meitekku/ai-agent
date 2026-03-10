import glob
import os
import re
import shutil

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db
from ..rag import get_rag, remove_instance, BASE_DATA_DIR

router = APIRouter()


class CreateKBRequest(BaseModel):
    slug: str
    name: str
    title: str = ""
    description: str = ""


class UpdateKBRequest(BaseModel):
    name: str | None = None
    title: str | None = None
    description: str | None = None


SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,98}[a-z0-9]$|^[a-z0-9]$")


@router.get("/kbs")
async def list_kbs():
    kbs = await db.list_kbs()
    return {"knowledge_bases": kbs}


@router.post("/kbs", status_code=201)
async def create_kb(req: CreateKBRequest):
    if not SLUG_RE.match(req.slug):
        raise HTTPException(400, "slug must be lowercase alphanumeric with hyphens/underscores, 1-100 chars")

    existing = await db.get_kb(req.slug)
    if existing:
        raise HTTPException(409, f"KB '{req.slug}' already exists")

    result = await db.create_kb(req.slug, req.name, req.title, req.description)
    return result


@router.get("/kbs/{slug}")
async def get_kb(slug: str):
    kb = await db.get_kb(slug)
    if not kb:
        raise HTTPException(404, f"KB '{slug}' not found")
    return kb


@router.put("/kbs/{slug}")
async def update_kb(slug: str, req: UpdateKBRequest):
    kb = await db.get_kb(slug)
    if not kb:
        raise HTTPException(404, f"KB '{slug}' not found")

    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        return kb

    await db.update_kb(slug, **updates)
    return await db.get_kb(slug)


@router.delete("/kbs/{slug}")
async def delete_kb(slug: str):
    kb = await db.get_kb(slug)
    if not kb:
        raise HTTPException(404, f"KB '{slug}' not found")

    # Delete ingest jobs
    deleted_jobs = await db.delete_jobs_by_kb(slug)

    # Clean up LightRAG PG tables for this workspace
    pool = db._pool
    async with pool.acquire() as conn:
        # LightRAG uses namespace/workspace prefix in table names
        # Delete rows where workspace matches
        for table in [
            "lightrag_doc_full", "lightrag_doc_status", "lightrag_doc_chunks",
            "lightrag_vdb_chunks", "lightrag_vdb_entity", "lightrag_vdb_relation",
            "lightrag_full_entities", "lightrag_full_relations",
            "lightrag_entity_chunks", "lightrag_relation_chunks",
            "lightrag_llm_cache",
        ]:
            try:
                await conn.execute(f"DELETE FROM {table} WHERE workspace = $1", slug)
            except Exception:
                pass  # Table might not exist yet

    # Remove graph files
    kb_dir = os.path.join(BASE_DATA_DIR, slug)
    if os.path.exists(kb_dir):
        shutil.rmtree(kb_dir, ignore_errors=True)
        print(f"[kbs] Removed KB directory: {kb_dir}")

    # Remove cached instance
    remove_instance(slug)

    # Delete KB record
    await db.delete_kb(slug)

    return {"slug": slug, "deleted_jobs": deleted_jobs, "message": f"KB '{slug}' deleted"}
