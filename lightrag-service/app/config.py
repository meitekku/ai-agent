import os
from dotenv import load_dotenv

load_dotenv()

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "local")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen3:30b")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
MLX_BASE_URL = os.getenv("MLX_BASE_URL", "http://localhost:8008/v1")
MLX_MODEL = os.getenv("MLX_MODEL", "mlx-community/Qwen3.5-35B-A3B-4bit")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
# OCR / document extraction model (GA, no deprecation). Kept separate from chat model.
GEMINI_OCR_MODEL = os.getenv("GEMINI_OCR_MODEL", "gemini-2.5-flash")
# Image generation model (old gemini-2.0-flash-exp retired 2026-06-01).
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
# Allowed Gemini models (comma-separated env), used to validate model overrides.
GEMINI_ALLOWED_MODELS = [
    m.strip() for m in os.getenv("GEMINI_ALLOWED_MODELS", "").split(",") if m.strip()
]
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "local")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "qwen3-embedding:8b")
GEMINI_EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "768"))

PG_HOST = os.getenv("PG_HOST", "localhost")
PG_PORT = int(os.getenv("PG_PORT", "5432"))
PG_USER = os.getenv("PG_USER", "raguser")
PG_PASSWORD = os.getenv("PG_PASSWORD", "ragpass")
PG_DATABASE = os.getenv("PG_DATABASE", "lightrag")

OCR_PROVIDER = os.getenv("OCR_PROVIDER", "local")
GLM_OCR_URL = os.getenv("GLM_OCR_URL", "http://localhost:8000")
PORT = int(os.getenv("PORT", "8007"))

# Vertex AI (when set, uses GCP billing / Free Trial credit instead of AI Studio)
USE_VERTEX_AI = os.getenv("USE_VERTEX_AI", "").lower() in ("true", "1", "yes")
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "")
GCP_LOCATION = os.getenv("GCP_LOCATION", "global")

# --- Phase1 env wiring (definitions only; reference swaps land in later phases) ---
# Language / locale. Default English; ja is selectable. i18n body is a later phase.
RAG_LANGUAGE = os.getenv("RAG_LANGUAGE", "en")
# CORS allowlist (comma-separated origins).
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()
]
# Optional bearer token for API auth.
API_AUTH_TOKEN = os.getenv("API_AUTH_TOKEN", "")
# Disable Gemini safety filters when truthy.
ENABLE_SAFETY_OFF = os.getenv("ENABLE_SAFETY_OFF", "").lower() in ("true", "1", "yes")
# Enable CSV row grouping during ingestion.
CSV_GROUPING_ENABLED = os.getenv("CSV_GROUPING_ENABLED", "").lower() in ("true", "1", "yes")
# Override OCR prompt (empty => use built-in default).
OCR_PROMPT = os.getenv("OCR_PROMPT", "")
