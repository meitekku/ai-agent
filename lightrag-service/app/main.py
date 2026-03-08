from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import PORT
from .rag import get_rag
from . import db
from .routers import ingest, query, documents, doc_status


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB (create tables)
    await db.init_db()
    print("[lightrag] DB initialized")

    # Initialize LightRAG
    print("[lightrag] Initializing LightRAG...")
    await get_rag()
    print("[lightrag] Ready")

    # Resume stale processing jobs
    import asyncio
    stale = await db.get_processing_jobs()
    if stale:
        print(f"[lightrag] Resuming {len(stale)} stale processing jobs")
        for job in stale:
            asyncio.create_task(ingest._process_background(job["doc_id"], job["track_id"]))

    yield


app = FastAPI(title="LightRAG Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
