from fastapi import APIRouter, HTTPException, Query

from ..rag import get_rag
from .. import db

router = APIRouter()


@router.get("/ingest/status/{track_id}")
async def get_ingest_status(track_id: str, kb: str = Query(..., description="KB slug")):
    kb_info = await db.get_kb(kb)
    if not kb_info:
        raise HTTPException(404, f"KB '{kb}' not found")

    rag = await get_rag(kb)
    docs = await rag.aget_docs_by_track_id(track_id)
    if not docs:
        raise HTTPException(404, "Track ID not found")

    from lightrag.base import DocStatus
    total = len(docs)
    processed = sum(1 for d in docs.values() if d.status == DocStatus.PROCESSED)
    failed = sum(1 for d in docs.values() if d.status == DocStatus.FAILED)
    errors = [d.error_msg for d in docs.values() if d.error_msg]

    # Determine overall status
    if failed > 0:
        status = "failed"
    elif processed == total:
        status = "processed"
    else:
        status = "processing"

    return {
        "track_id": track_id,
        "status": status,
        "docs_total": total,
        "docs_processed": processed,
        "docs_failed": failed,
        "error_msg": "; ".join(errors) if errors else None,
    }
