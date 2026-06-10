import { generateText } from "ai";
import { getChatModel, useGemini } from "./ollama-provider";
import { ROUTER_MODEL } from "./constants";

/**
 * Adaptive RAG router (2026 SOTA, opt-in via ADAPTIVE_RAG_ENABLED).
 *
 * A lightweight Gemini Flash classifier inspects the user's latest question and
 * picks one of three retrieval strategies:
 *
 *   - "direct"  → simple, single-fact lookup. Search once with a fast vector
 *                 mode ("local"). No iterative fan-out.
 *   - "complex" → multi-hop / comparative / synthesis question. Use the
 *                 graph-aware "mix" mode and allow the agent to iterate.
 *   - "skip"    → no retrieval needed (greeting, chit-chat, pure reasoning,
 *                 coding, translation). The agent should answer directly.
 *
 * The router NEVER hard-blocks the search tool; it only supplies a hint:
 *   - `mode`: the LightRAG query mode to prefer (undefined for "skip").
 *   - `searchHint`: a sentence injected into the system prompt nudging the
 *     model toward / away from retrieval.
 *
 * Failure is non-fatal: any error (or non-Gemini backend) yields a neutral
 * route that preserves the current always-search-via-tool behavior.
 */

export type RagDecision = "direct" | "complex" | "skip";

export interface RagRoute {
  decision: RagDecision;
  /** Preferred LightRAG query mode, or undefined when no retrieval is advised. */
  mode?: "local" | "hybrid" | "mix";
  /** Human-readable system-prompt nudge. Empty string when neutral. */
  searchHint: string;
}

/** Neutral route = current behavior (let the LLM decide via the search tool). */
const NEUTRAL_ROUTE: RagRoute = { decision: "complex", mode: undefined, searchHint: "" };

const ROUTER_PROMPT = `You are a fast query router for a retrieval-augmented assistant.
Classify the user's latest message into exactly one label:

- "direct": a simple, single-fact question answerable by one focused knowledge-base lookup (definitions, a specific value, "what is X", "who is Y").
- "complex": a multi-hop, comparative, analytical, or synthesis question that needs combining several pieces of information or graph relationships.
- "skip": no knowledge-base retrieval is needed at all — greetings, small talk, pure reasoning/math, code writing, translation, or rephrasing.

Reply with ONLY the lowercase label: direct, complex, or skip. No punctuation, no explanation.`;

/**
 * Extract plain text from the last user message's parts (UIMessage shape).
 * Falls back gracefully for string content.
 */
function lastUserText(
  messages: Array<{ role: string; parts?: unknown[]; content?: unknown }>,
): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  const parts = lastUser.parts;
  if (Array.isArray(parts)) {
    return parts
      .filter(
        (p): p is { type: "text"; text: string } =>
          !!p &&
          typeof p === "object" &&
          (p as { type?: string }).type === "text" &&
          typeof (p as { text?: unknown }).text === "string",
      )
      .map((p) => p.text)
      .join(" ")
      .trim();
  }
  if (typeof lastUser.content === "string") return lastUser.content.trim();
  return "";
}

function toRoute(decision: RagDecision): RagRoute {
  switch (decision) {
    case "direct":
      return {
        decision,
        mode: "local",
        searchHint:
          "この質問は単純な事実照会と判定されました。関連が高ければ searchKnowledgeBase を1回だけ呼び、過剰な反復検索は避けてください。",
      };
    case "complex":
      return {
        decision,
        mode: "mix",
        searchHint:
          "この質問はマルチホップ/分析的と判定されました。必要に応じて searchKnowledgeBase を複数回（異なる観点）呼び、グラフ関係も活用して統合回答してください。",
      };
    case "skip":
      return {
        decision,
        mode: undefined,
        searchHint:
          "この質問は検索不要と判定されました（挨拶・雑談・一般知識・コード・翻訳など）。ナレッジベース検索はスキップし、直接回答してください。ただしユーザーが明示的に検索を求めた場合は検索してよい。",
      };
  }
}

/**
 * Classify the latest user query. Returns a neutral route (current behavior)
 * when the adaptive router is disabled, the backend is non-Gemini, or any error
 * occurs. Never throws.
 */
export async function routeQuery(
  messages: Array<{ role: string; parts?: unknown[]; content?: unknown }>,
): Promise<RagRoute> {
  // Router only makes sense with a Gemini backend (classifier model). On MLX,
  // stay neutral to avoid spending a slow local generation on classification.
  if (!useGemini) return NEUTRAL_ROUTE;

  const question = lastUserText(messages);
  if (!question) return NEUTRAL_ROUTE;

  try {
    const t0 = Date.now();
    const { text } = await generateText({
      model: getChatModel(ROUTER_MODEL),
      system: ROUTER_PROMPT,
      prompt: question.slice(0, 4000),
      maxOutputTokens: 8,
      temperature: 0,
    });
    const label = text.trim().toLowerCase();
    const decision: RagDecision =
      label.includes("skip")
        ? "skip"
        : label.includes("direct")
          ? "direct"
          : label.includes("complex")
            ? "complex"
            : "complex"; // unknown → safe default (always-search behavior)
    console.log(
      `[rag-router] ${Date.now() - t0}ms → ${decision} (raw="${label.slice(0, 20)}")`,
    );
    return toRoute(decision);
  } catch (err) {
    console.error("[rag-router] classification failed, neutral route:", err);
    return NEUTRAL_ROUTE;
  }
}
