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
    """检索上下文，不生成答案。格式与 :8006 一致，供 AI SDK 使用。"""
    rag = await get_rag()

    context = await rag.aquery(
        req.question,
        param=QueryParam(
            mode="hybrid",
            only_need_context=True,
            top_k=req.top_k,
            ll_keywords=[req.question],
        ),
    )

    # 包装成与 query-service :8006 一致的格式
    return {
        "question": req.question,
        "results": [
            {
                "doc_id": None,
                "name": "LightRAG Knowledge Graph",
                "summary": None,
                "vector_rank": 0,
                "bm25_rank": None,
                "tree_context": {
                    "section_path": ["hybrid"],
                    "context": context if isinstance(context, str) else str(context),
                    "node_ids": [],
                },
            }
        ],
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
