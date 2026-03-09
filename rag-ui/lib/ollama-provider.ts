import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { GEMINI_API_KEY, GEMINI_MODEL, MLX_URL, MLX_MODEL } from "./constants";

const mlx = createOpenAI({
  baseURL: `${MLX_URL}/v1`,
  apiKey: "mlx",
});

/** true when GEMINI_API_KEY is configured */
export const useGemini = !!GEMINI_API_KEY;

/** Gemini provider instance (reused for tools.googleSearch) */
const gemini = useGemini
  ? createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY })
  : null;

/** Auto-select: Gemini if API key is set, otherwise MLX */
export function getChatModel() {
  if (gemini) {
    return gemini(GEMINI_MODEL);
  }
  return mlx.chat(MLX_MODEL);
}

/** Google Search tool (Gemini built-in grounding) — available when using Gemini */
export const geminiGoogleSearch = gemini?.tools.googleSearch({});

export const backendName = useGemini ? "Gemini" : "MLX";
