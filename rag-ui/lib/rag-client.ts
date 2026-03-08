import { LIGHTRAG_URL, QUERY_SERVICE_URL } from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  doc_id: string | null;
  name: string;
  tree_context: {
    section_path: string[];
    context: string;
    node_ids: string[];
  };
}

export interface SearchResponse {
  question: string;
  results: SearchResult[];
}

export interface IngestResponse {
  doc_id: string;
  name: string;
  page_count: number;
  track_id: string;
  status: string;
}

export interface DocumentInfo {
  id: string;
  name: string;
  page_count: number;
  status?: string;
  error_msg?: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 180_000; // LightRAG cold-start can take ~100s

/** Wrap fetch with a timeout to prevent hanging when backends are unresponsive. */
function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Build a safe error — logs the raw upstream body server-side but only
 * exposes a sanitised message to callers (which may forward it to clients).
 */
function buildError(label: string, status: number, body?: string): Error {
  if (body) console.error(`[rag-client] ${label}: ${status}`, body);
  return new Error(`${label} (${status})`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchOnly(
  question: string,
  options?: { topK?: number; service?: "lightrag" | "pageindex" },
): Promise<SearchResponse> {
  const baseUrl = options?.service === "pageindex" ? QUERY_SERVICE_URL : LIGHTRAG_URL;
  const res = await fetchWithTimeout(`${baseUrl}/query/search-only`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      top_k: options?.topK ?? 5,
    }),
  });
  if (!res.ok) throw buildError("Search failed", res.status, await res.text());
  return res.json();
}

export async function ingestDocument(formData: FormData): Promise<IngestResponse> {
  const res = await fetchWithTimeout(
    `${LIGHTRAG_URL}/ingest`,
    { method: "POST", body: formData },
    30_000, // only waiting for OCR now
  );
  if (!res.ok) throw buildError("Ingest failed", res.status, await res.text());
  return res.json();
}

export async function listDocuments(): Promise<{ documents: DocumentInfo[] }> {
  const res = await fetchWithTimeout(`${LIGHTRAG_URL}/documents`);
  if (!res.ok) throw buildError("List documents failed", res.status, await res.text());
  return res.json();
}

export async function deleteDocument(docId: string): Promise<void> {
  const res = await fetchWithTimeout(`${LIGHTRAG_URL}/documents/${docId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw buildError("Delete failed", res.status, await res.text());
}
