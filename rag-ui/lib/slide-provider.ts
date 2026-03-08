import { createOpenAI } from "@ai-sdk/openai";
import {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  MLX_URL,
  MLX_MODEL,
  SLIDE_LLM_BASE_URL,
  SLIDE_LLM_API_KEY,
  SLIDE_LLM_MODEL,
} from "./constants";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

// Dedicated slide provider (created lazily if configured)
let _slideProvider: ReturnType<typeof createOpenAI> | null = null;

function getSlideProvider() {
  if (!SLIDE_LLM_BASE_URL || !SLIDE_LLM_API_KEY) return null;
  if (!_slideProvider) {
    _slideProvider = createOpenAI({
      baseURL: SLIDE_LLM_BASE_URL,
      apiKey: SLIDE_LLM_API_KEY,
    });
  }
  return _slideProvider;
}

/**
 * Get the LLM model for slide generation.
 *
 * Priority:
 * 1. If SLIDE_LLM_* env vars are set → use dedicated provider
 * 2. If GEMINI_API_KEY is set → Gemini
 * 3. Fallback → MLX
 */
export function getSlideModel() {
  const dedicated = getSlideProvider();
  if (dedicated && SLIDE_LLM_MODEL) {
    return dedicated.chat(SLIDE_LLM_MODEL);
  }
  if (GEMINI_API_KEY) {
    const gemini = createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY });
    return gemini(GEMINI_MODEL);
  }
  const mlx = createOpenAI({ baseURL: `${MLX_URL}/v1`, apiKey: "mlx" });
  return mlx.chat(MLX_MODEL);
}
