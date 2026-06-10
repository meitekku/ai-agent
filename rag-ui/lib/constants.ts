export const LIGHTRAG_URL = process.env.LIGHTRAG_URL || "http://localhost:8007";
export const QUERY_SERVICE_URL =
  process.env.QUERY_SERVICE_URL || "http://localhost:8006";
export const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434"; // embedding only
export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// MLX (fallback when GEMINI_API_KEY is not set)
export const MLX_URL = process.env.MLX_URL || "http://localhost:8008";
export const MLX_MODEL =
  process.env.MLX_MODEL || "mlx-community/Qwen3.5-35B-A3B-4bit";

// Embedding model for semantic cache
export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || "nomic-embed-text";

// Gemini (if API key set → Gemini, otherwise → MLX fallback)
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
export const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
export const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || "local";

// Embedding output dimensionality (Matryoshka — gemini-embedding-001 supports 768/1536/3072)
export const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || "768");

// Image generation model (Gemini native image output). Fallback handled in chat route.
export const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

// Allowed Gemini model IDs (whitelist). Comma-separated env, falls back to default set.
export const GEMINI_ALLOWED_MODELS = process.env.GEMINI_ALLOWED_MODELS || "";

// --- Search-quality SOTA features (all opt-in; defaults preserve current behavior) ---

// [1] Two-stage rerank. Mirrors lightrag config.RERANK_ENABLED. When true, the
// rag-ui search client requests server-side rerank (rerank=true) and widens the
// retrieval net to RETRIEVE_TOP_K. Default false => identical to current behavior.
export const RERANK_ENABLED =
  (process.env.RERANK_ENABLED || "").toLowerCase() === "true" ||
  process.env.RERANK_ENABLED === "1";
// Candidate breadth retrieved before reranking (mirrors lightrag RETRIEVE_TOP_K).
export const RETRIEVE_TOP_K = Number(process.env.RETRIEVE_TOP_K || "20");

// [2] Adaptive RAG router. When true, a lightweight Gemini Flash classifier routes
// each query to: direct vector search / iterative hybrid|mix / skip-search.
// Default false => current always-search-via-tool behavior is unchanged.
export const ADAPTIVE_RAG_ENABLED =
  (process.env.ADAPTIVE_RAG_ENABLED || "").toLowerCase() === "true" ||
  process.env.ADAPTIVE_RAG_ENABLED === "1";
// Lightweight Gemini model used as the router classifier.
export const ROUTER_MODEL = process.env.ROUTER_MODEL || "gemini-2.5-flash";

// [3] Semantic cache backend: "redis" (default, JS cosine scan) or "pgvector"
// (pgvector <=> nearest-neighbor search against a per-KB table).
export const SEMANTIC_CACHE_BACKEND = (
  process.env.SEMANTIC_CACHE_BACKEND || "redis"
).toLowerCase();

// Tavily web search (optional — enables webSearch tool in chat)
export const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

// Auth
export const AUTH_COOKIE_NAME = "pw";
export const REDIRECT_URL_COOKIE = "redirect_url";

// Slide LLM configuration (optional — falls back to chat model if not set)
export const SLIDE_LLM_BASE_URL = process.env.SLIDE_LLM_BASE_URL || "";
export const SLIDE_LLM_API_KEY = process.env.SLIDE_LLM_API_KEY || "";
export const SLIDE_LLM_MODEL = process.env.SLIDE_LLM_MODEL || "";

// CRM Service (optional — enables CRM tools in chat when set)
export const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || "";

// Task Worker (optional — enables scheduler tools in chat when set)
export const TASK_WORKER_URL = process.env.TASK_WORKER_URL || "";

// Vertex AI (when set, uses GCP billing / Free Trial credit instead of AI Studio)
export const USE_VERTEX_AI =
  (process.env.USE_VERTEX_AI || "").toLowerCase() === "true";
export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "";
export const GCP_LOCATION = process.env.GCP_LOCATION || "global";
