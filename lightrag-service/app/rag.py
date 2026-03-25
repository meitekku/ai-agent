import asyncio
import os
from collections import OrderedDict
from pathlib import Path

import numpy as np
import ollama

from lightrag import LightRAG, QueryParam
from lightrag.utils import EmbeddingFunc

from . import config

# Gemini generation config (shared between AI Studio and Vertex AI)
_gemini_generation_config = {
    "thinking_config": {"thinking_budget": 0, "include_thoughts": False},
    "safety_settings": [
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "OFF"},
    ],
}

# LLM provider switch
if config.LLM_PROVIDER == "gemini" and not config.USE_VERTEX_AI:
    from lightrag.llm.gemini import gemini_model_complete
    _llm_func = gemini_model_complete
    _llm_name = config.GEMINI_MODEL
    _llm_kwargs = {"generation_config": _gemini_generation_config}
    _llm_max_async = 8
elif config.LLM_PROVIDER == "gemini" and config.USE_VERTEX_AI:
    # Custom LLM function for Vertex AI (LightRAG's gemini_model_complete uses API key auth)
    async def _vertex_gemini_complete(
        prompt, system_prompt=None, history_messages=[], keyword_extraction=False, **kwargs
    ) -> str:
        from google.genai import types
        client = _get_gemini_client()
        contents = []
        for msg in history_messages:
            role = msg.get("role", "user")
            contents.append(types.Content(
                role="model" if role == "assistant" else "user",
                parts=[types.Part.from_text(text=msg.get("content", ""))],
            ))
        contents.append(types.Content(
            role="user",
            parts=[types.Part.from_text(text=prompt)],
        ))
        gen_config = kwargs.get("generation_config", _gemini_generation_config)
        model_name = kwargs.get("model_name", config.GEMINI_MODEL)
        response = await client.aio.models.generate_content(
            model=model_name,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                thinking_config=types.ThinkingConfig(**gen_config.get("thinking_config", {})),
                safety_settings=[
                    types.SafetySetting(**s) for s in gen_config.get("safety_settings", [])
                ],
            ),
        )
        return response.text or ""

    _llm_func = _vertex_gemini_complete
    _llm_name = config.GEMINI_MODEL
    _llm_kwargs = {"generation_config": _gemini_generation_config}
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

BASE_DATA_DIR = str(Path(__file__).resolve().parent.parent / "data" / "kbs")

# 设置 PG 连接环境变量（LightRAG 的 PG 存储通过环境变量读取连接信息）
os.environ.setdefault("POSTGRES_HOST", config.PG_HOST)
os.environ.setdefault("POSTGRES_PORT", str(config.PG_PORT))
os.environ.setdefault("POSTGRES_USER", config.PG_USER)
os.environ.setdefault("POSTGRES_PASSWORD", config.PG_PASSWORD)
os.environ.setdefault("POSTGRES_DATABASE", config.PG_DATABASE)
os.environ.setdefault("EMBEDDING_DIM", str(config.EMBEDDING_DIM))

# LRU cache of LightRAG instances
MAX_INSTANCES = 5
_instances: OrderedDict[str, LightRAG] = OrderedDict()
_lock = asyncio.Lock()


async def _embed_ollama(texts: list[str]) -> np.ndarray:
    """Ollama embedding（nomic-embed-text 等）。"""
    client = ollama.AsyncClient(host=config.OLLAMA_HOST)
    resp = await client.embed(model=config.EMBEDDING_MODEL, input=texts)
    return np.array(resp["embeddings"], dtype=np.float32)


_gemini_client = None

# Embedding rate limiter: max 4 concurrent requests + 0.25s interval → ~16 req/s peak, well within Tier 1 limits
_embed_sem = asyncio.Semaphore(4)
_embed_interval = 0.25
_embed_last_call = 0.0


def _get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        from google import genai
        if config.USE_VERTEX_AI:
            _gemini_client = genai.Client(
                vertexai=True,
                project=config.GCP_PROJECT_ID,
                location=config.GCP_LOCATION,
            )
        else:
            _gemini_client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _gemini_client


async def _embed_gemini(texts: list[str]) -> np.ndarray:
    """Gemini embedding (async, rate-limited)."""
    global _embed_last_call
    from google.genai import types

    async with _embed_sem:
        # Enforce minimum interval between calls
        now = asyncio.get_event_loop().time()
        wait = _embed_interval - (now - _embed_last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        _embed_last_call = asyncio.get_event_loop().time()

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


async def get_rag(kb_slug: str) -> LightRAG:
    """Get or create a LightRAG instance for the given KB slug (LRU cached)."""
    async with _lock:
        if kb_slug in _instances:
            # Move to end (most recently used)
            _instances.move_to_end(kb_slug)
            return _instances[kb_slug]

        # Evict oldest if at capacity
        while len(_instances) >= MAX_INSTANCES:
            evicted_slug, _ = _instances.popitem(last=False)
            print(f"[rag] Evicted LightRAG instance: {evicted_slug}")

    # Create new instance outside lock (initialization can be slow)
    working_dir = os.path.join(BASE_DATA_DIR, kb_slug)
    os.makedirs(working_dir, exist_ok=True)

    rag = LightRAG(
        working_dir=working_dir,
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
        graph_storage="NetworkXStorage",
        doc_status_storage="PGDocStatusStorage",
        llm_model_max_async=_llm_max_async,
        entity_extract_max_gleaning=1,
        default_llm_timeout=3600 if config.LLM_PROVIDER == "local" else 120,
        addon_params={"language": "Japanese"},
        # Use kb_slug as workspace to isolate PG table data per KB
        workspace=kb_slug,
    )
    await rag.initialize_storages()

    async with _lock:
        _instances[kb_slug] = rag
        _instances.move_to_end(kb_slug)

    print(f"[rag] Initialized LightRAG instance: {kb_slug} (working_dir={working_dir})")
    return rag


def remove_instance(kb_slug: str):
    """Remove a cached instance (e.g., when deleting a KB)."""
    _instances.pop(kb_slug, None)
