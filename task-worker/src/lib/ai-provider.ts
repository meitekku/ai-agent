import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";

const USE_VERTEX_AI = process.env.USE_VERTEX_AI === "true";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "";
const GCP_LOCATION = process.env.GCP_LOCATION || "global";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

// Image generation models (centralized here; consumed by tools.ts).
// Primary via GEMINI_IMAGE_MODEL (default gemini-3.1-flash-image), then fallback.
const IMAGE_MODEL_PRIMARY =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
const IMAGE_MODEL_FALLBACK = "gemini-2.5-flash-image";

// Deduplicated ordered list of image models to try (primary first, then fallback).
export const IMAGE_MODELS: string[] = [
  ...new Set([IMAGE_MODEL_PRIMARY, IMAGE_MODEL_FALLBACK]),
];

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

// Google Search grounding — AI Studio only (Vertex AI doesn't expose this tool via SDK)
export const googleSearchTool =
  !USE_VERTEX_AI && gemini
    ? (gemini as unknown as { tools?: { googleSearch?: (opts: object) => unknown } }).tools?.googleSearch?.({}) ?? null
    : null;
