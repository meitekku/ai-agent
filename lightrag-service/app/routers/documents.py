import glob
import os

from fastapi import APIRouter, HTTPException, Query

from .. import db
from ..rag import get_rag, BASE_DATA_DIR
from . import ingest

router = APIRouter()


@router.get("/documents")
async def list_documents(kb: str = Query(..., description="KB slug")):
    kb_info = await db.get_kb(kb)
    if not kb_info:
        raise HTTPException(404, f"KB '{kb}' not found")

    jobs = await db.fetch_all_jobs(kb)
    documents = [
        {
            "id": j["doc_id"],
            "name": j["name"],
            "page_count": j["page_count"],
            "status": j["status"],
            "error_msg": j.get("error_msg"),
        }
        for j in jobs
    ]
    return {"documents": documents}


@router.post("/documents/{doc_id}/resume")
async def resume_document(doc_id: str, kb: str = Query(..., description="KB slug")):
    """Resume a failed document's extraction (skips OCR, re-triggers LightRAG pipeline)."""
    job = await db.get_job(doc_id)
    if not job:
        raise HTTPException(404, "Document not found")
    if job["status"] != "failed":
        raise HTTPException(400, "Only failed documents can be resumed")
    if not job.get("track_id"):
        raise HTTPException(400, "track_id がありません。最初からリトライしてください。")

    await db.update_job_status(doc_id, "extracting")
    await ingest._process_background(doc_id, job["track_id"], job["kb_slug"])
    print(f"[documents] Resumed: {doc_id} (track_id={job['track_id']}) kb={kb}")

    return {"doc_id": doc_id, "status": "extracting"}


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, kb: str = Query(..., description="KB slug")):
    job = await db.get_job(doc_id)
    if not job:
        raise HTTPException(404, "Document not found")

    # 从 LightRAG 彻底删除（向量 + 图 + 实体）
    if job.get("track_id"):
        rag = await get_rag(kb)
        docs = await rag.aget_docs_by_track_id(job["track_id"])
        for internal_doc_id in docs:
            result = await rag.adelete_by_doc_id(internal_doc_id)
            print(f"[documents] Deleted {internal_doc_id}: {result.status}")

    # 删除元信息
    await db.delete_job(doc_id)
    return {"doc_id": doc_id, "message": "Deleted (KG entities and vectors removed)"}


@router.delete("/documents")
async def delete_all_documents(kb: str = Query(..., description="KB slug")):
    """指定 KB の全ドキュメントを削除"""
    kb_info = await db.get_kb(kb)
    if not kb_info:
        raise HTTPException(404, f"KB '{kb}' not found")

    pool = db._pool
    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM ingest_jobs WHERE kb_slug = $1", kb
        )
        # Delete ingest jobs for this KB
        await conn.execute("DELETE FROM ingest_jobs WHERE kb_slug = $1", kb)
        # Delete LightRAG data for this workspace
        for table in [
            "lightrag_doc_full", "lightrag_doc_status", "lightrag_doc_chunks",
            "lightrag_vdb_chunks", "lightrag_vdb_entity", "lightrag_vdb_relation",
            "lightrag_full_entities", "lightrag_full_relations",
            "lightrag_entity_chunks", "lightrag_relation_chunks",
            "lightrag_llm_cache",
        ]:
            try:
                await conn.execute(f"DELETE FROM {table} WHERE workspace = $1", kb)
            except Exception:
                pass

    # Delete NetworkX graph files for this KB
    kb_dir = os.path.join(BASE_DATA_DIR, kb)
    for f in glob.glob(os.path.join(kb_dir, "*.graphml")):
        os.remove(f)
        print(f"[documents] Removed graph file: {f}")

    print(f"[documents] Deleted all docs for KB '{kb}': {count} documents removed")
    return {"deleted": count, "message": f"Deleted {count} documents"}
