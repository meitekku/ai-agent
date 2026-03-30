import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";

const USE_VERTEX_AI = process.env.USE_VERTEX_AI === "true";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "";
const GCP_LOCATION = process.env.GCP_LOCATION || "global";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

const gemini =
  !USE_VERTEX_AI && GEMINI_API_KEY
    ? createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY })
    : null;

const vertex = USE_VERTEX_AI
  ? createVertex({ project: GCP_PROJECT_ID, location: GCP_LOCATION })
  : null;

export const providerOptionsKey: "vertex" | "google" = USE_VERTEX_AI
  ? "vertex"
  : "google";

export function getModel(modelOverride?: string) {
  const modelName = modelOverride || DEFAULT_MODEL;
  if (vertex) return vertex(modelName);
  if (gemini) return gemini(modelName);
  throw new Error(
    "No AI provider configured. Set GEMINI_API_KEY or USE_VERTEX_AI=true",
  );
}

// Image generation model — follows the same provider as getModel().
// Matches rag-ui/lib/ollama-provider.ts: gemini-3.1-flash-image-preview via image() on both providers.
export function getImageModel() {
  try {
    if (vertex) return vertex.image("gemini-3.1-flash-image-preview");
    if (gemini) return gemini.image("gemini-3.1-flash-image-preview");
    return null;
  } catch {
    return null;
  }
}

// Google Search grounding — AI Studio only (Vertex AI doesn't expose this tool via SDK)
export const googleSearchTool =
  !USE_VERTEX_AI && gemini
    ? (gemini as unknown as { tools?: { googleSearch?: (opts: object) => unknown } }).tools?.googleSearch?.({}) ?? null
    : null;
