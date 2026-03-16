import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export async function generateText(prompt: string, maxTokens = 4000): Promise<string> {
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const model = getGenAI().getGenerativeModel({ model: modelName });
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  });
  return result.response.text();
}

export async function generateChat(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens = 4000,
): Promise<string> {
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const model = getGenAI().getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  });
  const chat = model.startChat({
    history: messages.slice(0, -1).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    })),
  });
  const lastMsg = messages[messages.length - 1];
  const result = await chat.sendMessage(lastMsg.content);
  return result.response.text();
}
