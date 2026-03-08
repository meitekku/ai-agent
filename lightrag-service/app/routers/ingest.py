import asyncio
import re
import uuid

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from ..rag import get_rag
from ..ocr import ocr_pdf
from .. import db, config

router = APIRouter()

# Ollama 单 GPU 需要排他锁；Gemini 云端可并行
_processing_lock = asyncio.Lock() if config.LLM_PROVIDER != "gemini" else None


async def _process_background(doc_id: str, track_id: str):
    """Background task: process enqueued documents and update job status."""
    async def _do_process():
        try:
            rag = await get_rag()
            await rag.apipeline_process_enqueue_documents()

            # Check results
            docs = await rag.aget_docs_by_track_id(track_id)
            from lightrag.base import DocStatus
            failed = [d for d in docs.values() if d.status == DocStatus.FAILED]
            if failed:
                error_msgs = [d.error_msg or "unknown error" for d in failed]
                await db.update_job_status(doc_id, "failed", "; ".join(error_msgs))
            else:
                await db.update_job_status(doc_id, "processed")
            print(f"[ingest] Background processing done: {doc_id} ({track_id})")
        except Exception as e:
            print(f"[ingest] Background processing failed: {doc_id}: {e}")
            await db.update_job_status(doc_id, "failed", str(e))

    if _processing_lock:
        async with _processing_lock:
            await _do_process()
    else:
        await _do_process()


async def _ingest_background(doc_id: str, doc_name: str, file_bytes: bytes, filename: str):
    """Background task: OCR → enqueue → LLM processing."""
    try:
        # 1. OCR
        await db.update_job_status(doc_id, "ocr")
        print(f"[ingest] OCR processing: {filename}")
        pages = await ocr_pdf(file_bytes, filename)
        page_count = len(pages)
        print(f"[ingest] OCR done: {page_count} pages")

        # Check if job was deleted during OCR
        job = await db.get_job(doc_id)
        if not job:
            print(f"[ingest] Job {doc_id} was deleted during OCR, skipping")
            return

        # 2. Merge Markdown
        markdown = "\n\n".join(
            (
                f"## Page {p['page']}\n\n{p['text']}"
                if not re.match(r"^#{1,6}\s", p["text"].strip())
                else p["text"]
            )
            for p in pages
        )

        # 3. Enqueue into LightRAG
        await db.update_job_status(doc_id, "indexing")
        rag = await get_rag()
        print(f"[ingest] Enqueuing into LightRAG: {doc_name} ({doc_id})")
        track_id = await rag.apipeline_enqueue_documents(markdown, track_id=doc_id)
        print(f"[ingest] Enqueued: {doc_name}, track_id={track_id}")

        # 4. Update job with page_count and track_id
        await db.update_job_after_ocr(doc_id, page_count, track_id)

        # 5. LLM entity extraction
        await db.update_job_status(doc_id, "extracting")
        await _process_background(doc_id, track_id)

    except Exception as e:
        print(f"[ingest] Ingest failed: {doc_id}: {e}")
        await db.update_job_status(doc_id, "failed", str(e))


@router.post("/ingest")
async def ingest(
    file: UploadFile = File(...),
    name: str = Form(None),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files accepted")

    doc_name = name or file.filename.replace(".pdf", "").replace(".PDF", "")
    file_bytes = await file.read()

    # Save job immediately so it's visible in document list
    doc_id = str(uuid.uuid4())
    await db.save_job(doc_id, doc_name, 0, "", status="uploading")

    # Everything else runs in background
    asyncio.create_task(_ingest_background(doc_id, doc_name, file_bytes, file.filename))

    return {
        "doc_id": doc_id,
        "name": doc_name,
        "page_count": 0,
        "track_id": "",
        "status": "uploading",
    }
