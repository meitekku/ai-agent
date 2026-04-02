import { GoogleGenAI } from "@google/genai";

const USE_VERTEX_AI =
  (process.env.USE_VERTEX_AI || "").toLowerCase() === "true";
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "";
const GCP_LOCATION = process.env.GCP_LOCATION || "global";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    if (USE_VERTEX_AI) {
      client = new GoogleGenAI({
        vertexai: true,
        project: GCP_PROJECT_ID,
        location: GCP_LOCATION,
      });
    } else {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
      client = new GoogleGenAI({ apiKey });
    }
  }
  return client;
}

export async function generateText(
  prompt: string,
  maxTokens = 4000,
  modelOverride?: string,
): Promise<string> {
  const model = modelOverride || DEFAULT_MODEL;
  const result = await getClient().models.generateContent({
    model,
    contents: prompt,
    config: { maxOutputTokens: maxTokens },
  });
  return result.text ?? "";
}

export async function generateChat(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens = 4000,
  modelOverride?: string,
): Promise<string> {
  const model = modelOverride || DEFAULT_MODEL;
  const ai = getClient();

  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: maxTokens,
    },
    history: messages.slice(0, -1).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    })),
  });

  const lastMsg = messages[messages.length - 1];
  const result = await chat.sendMessage({ message: lastMsg.content });
  return result.text ?? "";
}
