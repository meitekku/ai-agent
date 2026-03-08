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
