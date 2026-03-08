import os
from dotenv import load_dotenv

load_dotenv()

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "local")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen3:30b")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
MLX_BASE_URL = os.getenv("MLX_BASE_URL", "http://localhost:8008/v1")
MLX_MODEL = os.getenv("MLX_MODEL", "mlx-community/Qwen3.5-35B-A3B-4bit")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "local")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "qwen3-embedding:8b")
GEMINI_EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "text-embedding-004")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "4096"))

PG_HOST = os.getenv("PG_HOST", "localhost")
PG_PORT = int(os.getenv("PG_PORT", "5432"))
PG_USER = os.getenv("PG_USER", "raguser")
PG_PASSWORD = os.getenv("PG_PASSWORD", "ragpass")
PG_DATABASE = os.getenv("PG_DATABASE", "lightrag")

OCR_PROVIDER = os.getenv("OCR_PROVIDER", "local")
GLM_OCR_URL = os.getenv("GLM_OCR_URL", "http://localhost:8000")
PORT = int(os.getenv("PORT", "8007"))
