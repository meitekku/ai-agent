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

/** Allowed Gemini model IDs (whitelist to prevent abuse) */
const ALLOWED_GEMINI_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-3-flash",
  "gemini-3.1-pro-preview",
]);

/** Auto-select: Gemini if API key is set, otherwise MLX. Accepts optional model override. */
export function getChatModel(modelOverride?: string | null) {
  if (gemini) {
    const model = modelOverride && ALLOWED_GEMINI_MODELS.has(modelOverride)
      ? modelOverride
      : GEMINI_MODEL;
    return gemini(model);
  }
  return mlx.chat(MLX_MODEL);
}

/** Google Search tool (Gemini built-in grounding) — available when using Gemini */
export const geminiGoogleSearch = gemini?.tools.googleSearch({});

export const backendName = useGemini ? "Gemini" : "MLX";
