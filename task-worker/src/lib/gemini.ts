import { GoogleGenerativeAI } from "@google/generative-ai";
import { VertexAI } from "@google-cloud/vertexai";

const USE_VERTEX_AI =
  (process.env.USE_VERTEX_AI || "").toLowerCase() === "true";
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "";
const GCP_LOCATION = process.env.GCP_LOCATION || "global";

// When location=global, @google-cloud/vertexai constructs "global-aiplatform.googleapis.com"
// which doesn't exist (404). Fall back to AI Studio SDK with GEMINI_API_KEY in that case.
const USE_VERTEX_SDK = USE_VERTEX_AI && GCP_LOCATION !== "global";

let genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

let vertexAI: VertexAI | null = null;
function getVertexAI(): VertexAI {
  if (!vertexAI) {
    vertexAI = new VertexAI({
      project: GCP_PROJECT_ID,
      location: GCP_LOCATION,
    });
  }
  return vertexAI;
}

// Unified content type (both SDKs use the same structure)
export interface Content {
  role: string;
  parts: Part[];
}

export interface Part {
  text?: string;
  functionCall?: { name: string; args: Record<string, string> };
  functionResponse?: { name: string; response: { result: string } };
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface GenerateContentResult {
  text: string | null;
  functionCalls: Array<{ name: string; args: Record<string, string> }>;
  promptTokens: number;
  outputTokens: number;
  _rawParts?: any[]; // Preserved parts with thought_signature for history
}

export async function generateContent(opts: {
  contents: Content[];
  systemPrompt: string;
  tools?: ToolDeclaration[];
  maxOutputTokens?: number;
  modelOverride?: string;
}): Promise<GenerateContentResult> {
  const modelName =
    opts.modelOverride || process.env.GEMINI_MODEL || "gemini-3-flash-preview";
  const maxOutputTokens = opts.maxOutputTokens || 4000;

  const toolsConfig =
    opts.tools && opts.tools.length > 0
      ? [{ functionDeclarations: opts.tools }]
      : undefined;

  if (USE_VERTEX_SDK) {
    // Vertex AI SDK path (only for non-global regions)
    const model = getVertexAI().getGenerativeModel({
      model: modelName,
      systemInstruction: {
        role: "system",
        parts: [{ text: opts.systemPrompt }],
      },
    });

    const result = await model.generateContent({
      contents: opts.contents as any,
      tools: toolsConfig as any,
      generationConfig: { maxOutputTokens },
    });

    const response = result.response;
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    return {
      text:
        parts
          .filter((p: any) => p.text)
          .map((p: any) => p.text)
          .join("") || null,
      functionCalls: parts
        .filter((p: any) => p.functionCall)
        .map((p: any) => ({
          name: p.functionCall.name,
          args: p.functionCall.args as Record<string, string>,
        })),
      promptTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
    };
  }

  // AI Studio SDK path (default, also used when location=global)
  const model = getGenAI().getGenerativeModel({
    model: modelName,
    systemInstruction: opts.systemPrompt,
  });

  const result = await model.generateContent({
    contents: opts.contents as any,
    tools: toolsConfig as any,
    generationConfig: { maxOutputTokens },
  });

  const response = result.response;
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  return {
    text:
      parts
        .filter((p) => p.text)
        .map((p) => p.text)
        .join("") || null,
    functionCalls: parts
      .filter((p) => p.functionCall)
      .map((p) => ({
        name: p.functionCall!.name,
        args: p.functionCall!.args as Record<string, string>,
      })),
    promptTokens: response.usageMetadata?.promptTokenCount || 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
    // Keep raw parts including thoughtSignature for history (required by thinking models)
    _rawParts: parts,
  };
}
