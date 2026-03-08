import {
  OLLAMA_URL,
  GEMINI_API_KEY,
  GEMINI_EMBEDDING_MODEL,
  EMBEDDING_PROVIDER,
} from "./constants";

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "qwen3-embedding:8b";

/**
 * Generate an embedding vector.
 * Switches between Ollama (local) and Gemini API based on EMBEDDING_PROVIDER.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (EMBEDDING_PROVIDER === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text }] },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      throw new Error(`Gemini embedding failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as {
      embedding: { values: number[] };
    };
    if (!data.embedding?.values) {
      throw new Error("No embedding returned from Gemini");
    }
    return data.embedding.values;
  }

  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Embedding request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { embeddings: number[][] };
  if (!data.embeddings?.[0]) {
    throw new Error("No embedding returned from Ollama");
  }
  return data.embeddings[0];
}

/**
 * Cosine similarity between two vectors. Returns value in [-1, 1].
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
