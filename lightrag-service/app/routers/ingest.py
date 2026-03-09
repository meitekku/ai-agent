import asyncio
import hashlib
import re
import uuid

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from ..rag import get_rag
from ..ocr import ocr_pdf
from .. import db

router = APIRouter()

# Global processing queue: serialize apipeline_process_enqueue_documents calls
# LightRAG has internal busy-flag that causes concurrent callers to return immediately,
# which leads to premature "processed" status. We serialize at our level instead.
_process_queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()
_processor_started = False


async def _pipeline_processor():
    """Single worker that processes enqueued documents one by one.

    LightRAG's apipeline_process_enqueue_documents() processes ALL pending docs
    in a single call (it pulls pending/failed/processing from doc_status storage).
    We serialize calls so each doc gets properly processed and status-checked.
    """
    from lightrag.base import DocStatus

    PIPELINE_TIMEOUT = 600  # 10 min max per batch
    POLL_INTERVAL = 5       # seconds between status checks
    POLL_MAX_WAIT = 300     # 5 min max polling after timeout

    while True:
        doc_id, track_id = await _process_queue.get()
        try:
            rag = await get_rag()
            print(f"[ingest] Pipeline processing: {doc_id} ({track_id})")

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
            failed = [d for d in docs.values() if d.status == DocStatus.FAILED]
            if failed:
                error_msgs = [d.error_msg or "unknown error" for d in failed]
                await db.update_job_status(doc_id, "failed", "; ".join(error_msgs))
            else:
                await db.update_job_status(doc_id, "processed")
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


async def _ingest_background(doc_id: str, doc_name: str, file_bytes: bytes, filename: str):
    """Background task: OCR → enqueue → submit to processing queue."""
    try:
        # 1. OCR (can run concurrently for multiple files)
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

        # 3. Enqueue into LightRAG (fast, just writes to doc_status storage)
        await db.update_job_status(doc_id, "indexing")
        rag = await get_rag()
        print(f"[ingest] Enqueuing into LightRAG: {doc_name} ({doc_id})")
        track_id = await rag.apipeline_enqueue_documents(
            markdown, file_paths=doc_name, track_id=doc_id
        )
        print(f"[ingest] Enqueued: {doc_name}, track_id={track_id}")

        # 4. Update job with page_count and track_id
        await db.update_job_after_ocr(doc_id, page_count, track_id)

        # 5. Submit to processing queue (serialized LLM entity extraction)
        await db.update_job_status(doc_id, "extracting")
        _ensure_processor()
        await _process_queue.put((doc_id, track_id))

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

    # Deduplication: check by content hash first, then by name (fallback for old docs without hash)
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    existing = await db.find_by_hash(file_hash)
    if existing:
        raise HTTPException(409, f"同じファイルが既に存在します: {existing['name']}")
    existing = await db.find_by_name(doc_name)
    if existing:
        raise HTTPException(409, f"同じ名前のドキュメントが既に存在します: {existing['name']}")

    # Save job immediately so it's visible in document list
    doc_id = str(uuid.uuid4())
    await db.save_job(doc_id, doc_name, 0, "", status="uploading", file_hash=file_hash)

    # Everything else runs in background
    asyncio.create_task(_ingest_background(doc_id, doc_name, file_bytes, file.filename))

    return {
        "doc_id": doc_id,
        "name": doc_name,
        "page_count": 0,
        "track_id": "",
        "status": "uploading",
    }
