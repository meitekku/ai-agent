import asyncio
import hashlib
import os
import uuid

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query

from ..rag import get_rag
from ..extract import extract_text
from .. import db

SUPPORTED_EXTENSIONS = {
    ".pdf", ".txt", ".md", ".csv", ".docx", ".xlsx", ".pptx",
    ".html", ".htm", ".png", ".jpg", ".jpeg", ".gif", ".webp",
}

router = APIRouter()

# Global processing queue: serialize apipeline_process_enqueue_documents calls
# LightRAG has internal busy-flag that causes concurrent callers to return immediately,
# which leads to premature "processed" status. We serialize at our level instead.
_process_queue: asyncio.Queue[tuple[str, str, str]] = asyncio.Queue()
_processor_started = False


async def _pipeline_processor():
    """Single worker that processes enqueued documents one by one.

    LightRAG's apipeline_process_enqueue_documents() processes ALL pending docs
    in a single call (it pulls pending/failed/processing from doc_status storage).
    We serialize calls so each doc gets properly processed and status-checked.
    """
    from lightrag.base import DocStatus

    PIPELINE_TIMEOUT = 1800  # 30 min max per batch (large CSV can have 1000+ entities)
    POLL_INTERVAL = 5        # seconds between status checks
    POLL_MAX_WAIT = 600      # 10 min max polling after timeout

    while True:
        doc_id, track_id, kb_slug = await _process_queue.get()
        try:
            rag = await get_rag(kb_slug)
            print(f"[ingest] Pipeline processing: {doc_id} ({track_id}) kb={kb_slug}")

            try:
                await asyncio.wait_for(
                    rag.apipeline_process_enqueue_documents(),
                    timeout=PIPELINE_TIMEOUT,
                )
            except asyncio.TimeoutError:
                print(f"[ingest] Pipeline call timed out after {PIPELINE_TIMEOUT}s, polling doc status...")

            # Poll doc_status until terminal state (handles both normal return and timeout)
            waited = 0
            while waited < POLL_MAX_WAIT:
                docs = await rag.aget_docs_by_track_id(track_id)
                if not docs:
                    break
                statuses = {d.status for d in docs.values()}
                # All terminal → done
                if statuses <= {DocStatus.PROCESSED, DocStatus.FAILED}:
                    break
                await asyncio.sleep(POLL_INTERVAL)
                waited += POLL_INTERVAL

            # Check final results
            docs = await rag.aget_docs_by_track_id(track_id)
            if not docs:
                await db.update_job_status(doc_id, "failed", "ドキュメントが見つかりません")
            else:
                statuses = {d.status for d in docs.values()}
                failed = [d for d in docs.values() if d.status == DocStatus.FAILED]
                processed = [d for d in docs.values() if d.status == DocStatus.PROCESSED]
                if failed:
                    error_msgs = [d.error_msg or "unknown error" for d in failed]
                    await db.update_job_status(doc_id, "failed", "; ".join(error_msgs))
                elif len(processed) == len(docs):
                    # All docs are PROCESSED — genuinely done
                    await db.update_job_status(doc_id, "processed")
                else:
                    # Still processing after timeout — mark as failed
                    remaining = [s.value for s in statuses if s not in (DocStatus.PROCESSED, DocStatus.FAILED)]
                    await db.update_job_status(
                        doc_id, "failed",
                        f"処理タイムアウト（残りステータス: {', '.join(remaining)}）。再アップロードしてください。"
                    )
            print(f"[ingest] Pipeline done: {doc_id} ({track_id})")
        except Exception as e:
            print(f"[ingest] Pipeline failed: {doc_id}: {e}")
            await db.update_job_status(doc_id, "failed", str(e))
        finally:
            _process_queue.task_done()


def _ensure_processor():
    """Start the singleton pipeline processor task if not already running."""
    global _processor_started
    if not _processor_started:
        asyncio.create_task(_pipeline_processor())
        _processor_started = True


async def _ingest_background(doc_id: str, doc_name: str, file_bytes: bytes, filename: str, kb_slug: str):
    """Background task: extract text → enqueue → submit to processing queue."""
    try:
        # 1. Text extraction (can run concurrently for multiple files)
        await db.update_job_status(doc_id, "ocr")
        print(f"[ingest] Extracting text: {filename}")
        markdown, page_count = await extract_text(file_bytes, filename)
        print(f"[ingest] Extraction done: {page_count} pages")

        # Check if job was deleted during extraction
        job = await db.get_job(doc_id)
        if not job:
            print(f"[ingest] Job {doc_id} was deleted during extraction, skipping")
            return

        # 3. Enqueue into LightRAG (fast, just writes to doc_status storage)
        await db.update_job_status(doc_id, "indexing")
        rag = await get_rag(kb_slug)
        print(f"[ingest] Enqueuing into LightRAG: {doc_name} ({doc_id}) kb={kb_slug}")
        track_id = await rag.apipeline_enqueue_documents(
            markdown, file_paths=doc_name, track_id=doc_id
        )
        print(f"[ingest] Enqueued: {doc_name}, track_id={track_id}")

        # 4. Update job with page_count and track_id
        await db.update_job_after_ocr(doc_id, page_count, track_id)

        # 5. Submit to processing queue (serialized LLM entity extraction)
        await db.update_job_status(doc_id, "extracting")
        _ensure_processor()
        await _process_queue.put((doc_id, track_id, kb_slug))

    except Exception as e:
        print(f"[ingest] Ingest failed: {doc_id}: {e}")
        await db.update_job_status(doc_id, "failed", str(e))


async def _process_background(doc_id: str, track_id: str, kb_slug: str):
    """Resume a stale processing job."""
    _ensure_processor()
    await _process_queue.put((doc_id, track_id, kb_slug))


@router.post("/ingest")
async def ingest(
    file: UploadFile = File(...),
    name: str = Form(None),
    kb: str = Query(..., description="KB slug"),
):
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file format: {file_ext}")

    # Verify KB exists
    kb_info = await db.get_kb(kb)
    if not kb_info:
        raise HTTPException(404, f"KB '{kb}' not found")

    doc_name = name or os.path.splitext(file.filename)[0]
    file_bytes = await file.read()

    # Deduplication: check by content hash first, then by name (fallback for old docs without hash)
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    existing = await db.find_by_hash(file_hash, kb)
    if existing:
        raise HTTPException(409, f"同じファイルが既に存在します: {existing['name']}")
    existing = await db.find_by_name(doc_name, kb)
    if existing:
        raise HTTPException(409, f"同じ名前のドキュメントが既に存在します: {existing['name']}")

    # Save job immediately so it's visible in document list
    doc_id = str(uuid.uuid4())
    await db.save_job(doc_id, doc_name, kb, 0, "", status="uploading", file_hash=file_hash)

    # Everything else runs in background
    asyncio.create_task(_ingest_background(doc_id, doc_name, file_bytes, file.filename, kb))

    return {
        "doc_id": doc_id,
        "name": doc_name,
        "kb": kb,
        "page_count": 0,
        "track_id": "",
        "status": "uploading",
    }
