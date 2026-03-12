from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import PORT
from . import db
from .routers import ingest, query, documents, doc_status, kbs


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB (create tables)
    await db.init_db()
    print("[lightrag] DB initialized")

    # No automatic RAG initialization — instances are loaded lazily per KB
    print("[lightrag] Ready (KB instances will be loaded on demand)")

    # Resume stale jobs after restart
    import asyncio
    stale = await db.get_stale_jobs()
    if stale:
        resumable = 0
        failed = 0
        for job in stale:
            has_track = bool(job["track_id"])
            if has_track and job["status"] in ("processing", "extracting", "indexing"):
                # Data is already in LightRAG doc_status — re-queue pipeline
                await db.update_job_status(job["doc_id"], "extracting")
                asyncio.create_task(
                    ingest._process_background(job["doc_id"], job["track_id"], job["kb_slug"])
                )
                resumable += 1
            else:
                # uploading/ocr or no track_id — file bytes lost, can't recover
                await db.update_job_status(job["doc_id"], "failed", "サーバー再起動により中断されました。再アップロードしてください。")
                failed += 1
        print(f"[lightrag] Stale jobs: {resumable} resumed, {failed} marked failed")

    yield


app = FastAPI(title="LightRAG Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(kbs.router)
app.include_router(ingest.router)
app.include_router(query.router)
app.include_router(documents.router)
app.include_router(doc_status.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
