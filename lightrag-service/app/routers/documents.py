import glob
import os

from fastapi import APIRouter, HTTPException

from .. import db
from ..rag import get_rag

router = APIRouter()


@router.get("/documents")
async def list_documents():
    jobs = await db.fetch_all_jobs()
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


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    job = await db.get_job(doc_id)
    if not job:
        raise HTTPException(404, "Document not found")

    # 从 LightRAG 彻底删除（向量 + 图 + 实体）
    if job.get("track_id"):
        rag = await get_rag()
        docs = await rag.aget_docs_by_track_id(job["track_id"])
        for internal_doc_id in docs:
            result = await rag.adelete_by_doc_id(internal_doc_id)
            print(f"[documents] Deleted {internal_doc_id}: {result.status}")

    # 删除元信息
    await db.delete_job(doc_id)
    return {"doc_id": doc_id, "message": "Deleted (KG entities and vectors removed)"}


@router.delete("/documents")
async def delete_all_documents():
    """全ドキュメントを削除（TRUNCATE で一瞬）"""
    pool = db._pool
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM ingest_jobs")
        await conn.execute("""
            TRUNCATE
                ingest_jobs,
                lightrag_doc_full,
                lightrag_doc_status,
                lightrag_doc_chunks,
                lightrag_vdb_chunks,
                lightrag_vdb_entity,
                lightrag_vdb_relation,
                lightrag_full_entities,
                lightrag_full_relations,
                lightrag_entity_chunks,
                lightrag_relation_chunks,
                lightrag_llm_cache
            CASCADE
        """)
        # Clear kb_config
        await conn.execute("DELETE FROM kb_config")
    # Delete NetworkX graph files
    for f in glob.glob("/app/data/*.graphml"):
        os.remove(f)
        print(f"[documents] Removed graph file: {f}")

    print(f"[documents] TRUNCATE all: {count} documents removed")
    return {"deleted": count, "message": f"Deleted {count} documents"}
