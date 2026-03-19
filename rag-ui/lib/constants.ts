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
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
export const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";
export const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || "local";

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
