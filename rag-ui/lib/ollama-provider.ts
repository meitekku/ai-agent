import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { GEMINI_API_KEY, GEMINI_MODEL, MLX_URL, MLX_MODEL } from "./constants";

const mlx = createOpenAI({
  baseURL: `${MLX_URL}/v1`,
  apiKey: "mlx",
});

/** true when GEMINI_API_KEY is configured */
export const useGemini = !!GEMINI_API_KEY;

/** Auto-select: Gemini if API key is set, otherwise MLX */
export function getChatModel() {
  if (useGemini) {
    const gemini = createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY });
    return gemini(GEMINI_MODEL);
  }
  return mlx.chat(MLX_MODEL);
}

export const backendName = useGemini ? "Gemini" : "MLX";
