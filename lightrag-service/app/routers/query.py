import json
import inspect
from typing import Optional

from fastapi import APIRouter, HTTPException, Query as QParam
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from lightrag import QueryParam

from ..rag import get_rag
from .. import config
from .. import db

router = APIRouter()


class QueryRequest(BaseModel):
    question: str
    top_k: int = 5
    stream: bool = False
    # [2] Query-mode selection. None => current default behavior ("hybrid").
    mode: Optional[str] = None
    # [2] Per-request rerank override. None => fall back to config.RERANK_ENABLED.
    rerank: Optional[bool] = None


_VALID_MODES = {"local", "global", "hybrid", "mix"}


def _build_query_param(req: "QueryRequest", **extra) -> QueryParam:
    """Build a QueryParam from the request, fully backward compatible.

    - mode: defaults to "hybrid" (unchanged) when not supplied or invalid.
    - rerank: defaults to config.RERANK_ENABLED when not supplied.
    - When rerank is active, retrieve RETRIEVE_TOP_K candidates and let the
      reranker narrow to RERANK_TOP_K (chunk_top_k); otherwise honor req.top_k.
    """
    mode = req.mode if req.mode in _VALID_MODES else "hybrid"
    rerank_on = config.RERANK_ENABLED if req.rerank is None else bool(req.rerank)

    # Default path (rerank off): identical to the original QueryParam(mode, top_k).
    params: dict = {"mode": mode, "top_k": req.top_k}
    if rerank_on:
        # Retrieve a wider net, then let the reranker narrow to RERANK_TOP_K.
        params["enable_rerank"] = True
        params["top_k"] = config.RETRIEVE_TOP_K
        params["chunk_top_k"] = config.RERANK_TOP_K
    elif config.RERANK_ENABLED and req.rerank is False:
        # Instance was built with a rerank_model_func; honor an explicit opt-out.
        params["enable_rerank"] = False
    params.update(extra)
    return QueryParam(**params)


@router.post("/query/search-only")
async def search_only(req: QueryRequest, kb: str = QParam(..., description="KB slug")):
    """検索コンテキスト取得。チャンク単位でソースドキュメント名を返す。"""
    kb_info = await db.get_kb(kb)
    if not kb_info:
        raise HTTPException(404, f"KB '{kb}' not found")

    rag = await get_rag(kb)

    result = await rag.aquery_llm(
        req.question,
        param=_build_query_param(
            req,
            only_need_context=True,
            ll_keywords=[req.question],
        ),
    )

    data = result.get("data", {})
    chunks = data.get("chunks", [])

    # Group chunks by source document (file_path)
    doc_chunks: dict[str, list[dict]] = {}
    for chunk in chunks:
        fp = chunk.get("file_path", "unknown_source") or "unknown_source"
        doc_chunks.setdefault(fp, []).append(chunk)

    # Also collect unique source documents from entities and relationships
    source_docs = set()
    for entity in data.get("entities", []):
        fp = entity.get("file_path")
        if fp and fp != "unknown_source":
            source_docs.add(fp)
    for rel in data.get("relationships", []):
        fp = rel.get("file_path")
        if fp and fp != "unknown_source":
            source_docs.add(fp)
    for fp in doc_chunks:
        if fp != "unknown_source":
            source_docs.add(fp)

    # Build per-document results
    results = []
    for fp, fp_chunks in doc_chunks.items():
        content_parts = [c.get("content", "") for c in fp_chunks]
        results.append({
            "doc_id": None,
            "name": fp,
            "content": "\n\n---\n\n".join(content_parts),
        })

    # Build knowledge graph context (entities + relationships)
    kg_entities = data.get("entities", [])
    kg_relations = data.get("relationships", [])
    kg_context = ""
    if kg_entities:
        kg_context += "ナレッジグラフ（エンティティ）:\n"
        for e in kg_entities:
            kg_context += f"- {e.get('entity_name', '')}: {e.get('description', '')}\n"
    if kg_relations:
        kg_context += "\nナレッジグラフ（関係）:\n"
        for r in kg_relations:
            kg_context += f"- {r.get('src_id', '')} → {r.get('tgt_id', '')}: {r.get('description', '')}\n"

    return {
        "question": req.question,
        "results": results,
        "knowledge_graph": kg_context,
        "source_documents": sorted(source_docs),
    }


@router.post("/query")
async def query(req: QueryRequest, kb: str = QParam(..., description="KB slug")):
    """检索 + LLM 生成答案。支持流式 SSE。"""
    kb_info = await db.get_kb(kb)
    if not kb_info:
        raise HTTPException(404, f"KB '{kb}' not found")

    rag = await get_rag(kb)

    sources = [{"document": "LightRAG Knowledge Graph", "sections": ["hybrid"]}]

    if req.stream:
        return StreamingResponse(
            _stream_response(rag, req, sources),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )

    # 非流式
    answer = await rag.aquery(
        req.question,
        param=_build_query_param(req),
    )

    return {
        "answer": answer if isinstance(answer, str) else str(answer),
        "sources": sources,
    }


async def _stream_response(rag, req: "QueryRequest", sources: list):
    """SSE 流式输出，格式与 query-service :8006 一致。"""
    # 先发送来源
    yield f"data: {json.dumps({'type': 'sources', 'sources': sources}, ensure_ascii=False)}\n\n"

    # 流式生成答案
    resp = await rag.aquery(
        req.question,
        param=_build_query_param(req, stream=True),
    )

    if inspect.isasyncgen(resp):
        async for chunk in resp:
            yield f"data: {json.dumps({'type': 'delta', 'content': chunk}, ensure_ascii=False)}\n\n"
    else:
        # 如果不是异步生成器，整体返回
        text = resp if isinstance(resp, str) else str(resp)
        yield f"data: {json.dumps({'type': 'delta', 'content': text}, ensure_ascii=False)}\n\n"

    yield "data: [DONE]\n\n"
