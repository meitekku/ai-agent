import json
import inspect

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from lightrag import QueryParam

from ..rag import get_rag

router = APIRouter()


class QueryRequest(BaseModel):
    question: str
    top_k: int = 5
    stream: bool = False


@router.post("/query/search-only")
async def search_only(req: QueryRequest):
    """検索コンテキスト取得。チャンク単位でソースドキュメント名を返す。"""
    rag = await get_rag()

    result = await rag.aquery_llm(
        req.question,
        param=QueryParam(
            mode="hybrid",
            only_need_context=True,
            top_k=req.top_k,
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
async def query(req: QueryRequest):
    """检索 + LLM 生成答案。支持流式 SSE。"""
    rag = await get_rag()

    sources = [{"document": "LightRAG Knowledge Graph", "sections": ["hybrid"]}]

    if req.stream:
        return StreamingResponse(
            _stream_response(rag, req.question, req.top_k, sources),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )

    # 非流式
    answer = await rag.aquery(
        req.question,
        param=QueryParam(mode="hybrid", top_k=req.top_k),
    )

    return {
        "answer": answer if isinstance(answer, str) else str(answer),
        "sources": sources,
    }


async def _stream_response(rag, question: str, top_k: int, sources: list):
    """SSE 流式输出，格式与 query-service :8006 一致。"""
    # 先发送来源
    yield f"data: {json.dumps({'type': 'sources', 'sources': sources}, ensure_ascii=False)}\n\n"

    # 流式生成答案
    resp = await rag.aquery(
        question,
        param=QueryParam(mode="hybrid", top_k=top_k, stream=True),
    )

    if inspect.isasyncgen(resp):
        async for chunk in resp:
            yield f"data: {json.dumps({'type': 'delta', 'content': chunk}, ensure_ascii=False)}\n\n"
    else:
        # 如果不是异步生成器，整体返回
        text = resp if isinstance(resp, str) else str(resp)
        yield f"data: {json.dumps({'type': 'delta', 'content': text}, ensure_ascii=False)}\n\n"

    yield "data: [DONE]\n\n"
