import asyncio
import os
from pathlib import Path

import numpy as np
import ollama

from lightrag import LightRAG, QueryParam
from lightrag.utils import EmbeddingFunc

from . import config

# LLM provider switch
if config.LLM_PROVIDER == "gemini":
    from lightrag.llm.gemini import gemini_model_complete
    _llm_func = gemini_model_complete
    _llm_name = config.GEMINI_MODEL
    _llm_kwargs = {}
    _llm_max_async = 8
elif config.LLM_PROVIDER == "mlx":
    from lightrag.llm.openai import openai_complete
    _llm_func = openai_complete
    _llm_name = config.MLX_MODEL
    _llm_kwargs = {"base_url": config.MLX_BASE_URL, "api_key": "mlx"}
    _llm_max_async = 1
else:
    from lightrag.llm.ollama import ollama_model_complete
    _llm_func = ollama_model_complete
    _llm_name = config.LLM_MODEL
    _llm_kwargs = {"host": config.OLLAMA_HOST, "options": {"num_ctx": 8192}, "timeout": 3600}
    _llm_max_async = 1

WORKING_DIR = str(Path(__file__).resolve().parent.parent / "data")

# 设置 PG 连接环境变量（LightRAG 的 PG 存储通过环境变量读取连接信息）
os.environ.setdefault("POSTGRES_HOST", config.PG_HOST)
os.environ.setdefault("POSTGRES_PORT", str(config.PG_PORT))
os.environ.setdefault("POSTGRES_USER", config.PG_USER)
os.environ.setdefault("POSTGRES_PASSWORD", config.PG_PASSWORD)
os.environ.setdefault("POSTGRES_DATABASE", config.PG_DATABASE)
os.environ.setdefault("EMBEDDING_DIM", str(config.EMBEDDING_DIM))

_rag: LightRAG | None = None


async def _embed_ollama(texts: list[str]) -> np.ndarray:
    """Ollama embedding（nomic-embed-text 等）。"""
    client = ollama.AsyncClient(host=config.OLLAMA_HOST)
    resp = await client.embed(model=config.EMBEDDING_MODEL, input=texts)
    return np.array(resp["embeddings"], dtype=np.float32)


_gemini_client = None


def _get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        from google import genai
        _gemini_client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _gemini_client


async def _embed_gemini(texts: list[str]) -> np.ndarray:
    """Gemini embedding (async, paid tier)."""
    from google.genai import types

    client = _get_gemini_client()
    result = await client.aio.models.embed_content(
        model=config.GEMINI_EMBEDDING_MODEL,
        contents=texts,
        config=types.EmbedContentConfig(
            output_dimensionality=config.EMBEDDING_DIM,
        ),
    )
    return np.array([e.values for e in result.embeddings], dtype=np.float32)


_embed = _embed_gemini if config.EMBEDDING_PROVIDER == "gemini" else _embed_ollama


async def get_rag() -> LightRAG:
    global _rag
    if _rag is not None:
        return _rag

    _rag = LightRAG(
        working_dir=WORKING_DIR,
        llm_model_func=_llm_func,
        llm_model_name=_llm_name,
        llm_model_kwargs=_llm_kwargs,
        embedding_func=EmbeddingFunc(
            embedding_dim=config.EMBEDDING_DIM,
            max_token_size=8192,
            func=_embed,
        ),
        kv_storage="PGKVStorage",
        vector_storage="PGVectorStorage",
        graph_storage="NetworkXStorage",  # AGE 扩展未安装，用 NetworkX 本地文件
        doc_status_storage="PGDocStatusStorage",
        llm_model_max_async=_llm_max_async,
        default_llm_timeout=3600 if config.LLM_PROVIDER == "local" else 120,
        # 日语文档，实体/摘要/关键词提取全部用日语
        addon_params={"language": "Japanese"},
    )
    await _rag.initialize_storages()
    return _rag
