import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  MLX_URL,
  MLX_MODEL,
  USE_VERTEX_AI,
  GCP_PROJECT_ID,
  GCP_LOCATION,
} from "./constants";

const mlx = createOpenAI({
  baseURL: `${MLX_URL}/v1`,
  apiKey: "mlx",
});

/** true when Gemini is available (via AI Studio key OR Vertex AI) */
export const useGemini = !!GEMINI_API_KEY || USE_VERTEX_AI;

/** AI Studio provider (when not using Vertex AI) */
const gemini =
  !USE_VERTEX_AI && GEMINI_API_KEY
    ? createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY })
    : null;

/** Vertex AI provider (when USE_VERTEX_AI=true) */
const vertex = USE_VERTEX_AI
  ? createVertex({ project: GCP_PROJECT_ID, location: GCP_LOCATION })
  : null;

/** providerOptions key — "vertex" for Vertex AI, "google" for AI Studio */
export const providerOptionsKey: "vertex" | "google" = USE_VERTEX_AI
  ? "vertex"
  : "google";

/** Allowed Gemini model IDs (whitelist to prevent abuse) */
export const ALLOWED_GEMINI_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-image-preview", // Nano Banana 2 — used internally by generateImage tool
  "gemini-2.5-flash-image", // Nano Banana — fallback for generateImage 429
]);

/** Auto-select: Vertex AI > AI Studio > MLX. Accepts optional model override. */
export function getChatModel(modelOverride?: string | null) {
  const model =
    modelOverride && ALLOWED_GEMINI_MODELS.has(modelOverride)
      ? modelOverride
      : GEMINI_MODEL;
  if (vertex) return vertex(model);
  if (gemini) return gemini(model);
  return mlx.chat(MLX_MODEL);
}

/** Google Search tool (Gemini built-in grounding) — only available with AI Studio provider */
export const geminiGoogleSearch = gemini?.tools.googleSearch({}) ?? null;

export const backendName = useGemini ? "Gemini" : "MLX";
