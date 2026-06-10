import {
  LIGHTRAG_URL,
  QUERY_SERVICE_URL,
  RERANK_ENABLED,
  RETRIEVE_TOP_K,
} from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  doc_id: string | null;
  name: string;
  content: string;
  // Legacy fields (kept for backward compatibility)
  tree_context?: {
    section_path: string[];
    context: string;
    node_ids: string[];
  };
}

export interface SearchResponse {
  question: string;
  results: SearchResult[];
  knowledge_graph?: string;
  source_documents?: string[];
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

export interface KnowledgeBase {
  slug: string;
  name: string;
  title: string;
  description: string;
  doc_count: number;
  created_at?: string;
  updated_at?: string;
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
// Knowledge Base API
// ---------------------------------------------------------------------------

export async function listKBs(): Promise<KnowledgeBase[]> {
  const res = await fetchWithTimeout(`${LIGHTRAG_URL}/kbs`);
  if (!res.ok)
    throw buildError("List KBs failed", res.status, await res.text());
  const data = await res.json();
  return data.knowledge_bases || [];
}

export async function createKB(data: {
  slug: string;
  name: string;
  title?: string;
  description?: string;
}): Promise<KnowledgeBase> {
  const res = await fetchWithTimeout(`${LIGHTRAG_URL}/kbs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 409) {
      const detail = (() => {
        try {
          return JSON.parse(body).detail;
        } catch {
          return body;
        }
      })();
      throw new Error(detail || "KB already exists");
    }
    throw buildError("Create KB failed", res.status, body);
  }
  return res.json();
}

export async function getKB(slug: string): Promise<KnowledgeBase> {
  const res = await fetchWithTimeout(`${LIGHTRAG_URL}/kbs/${slug}`);
  if (!res.ok) throw buildError("Get KB failed", res.status, await res.text());
  return res.json();
}

export async function updateKB(
  slug: string,
  data: { name?: string; title?: string; description?: string },
): Promise<KnowledgeBase> {
  const res = await fetchWithTimeout(`${LIGHTRAG_URL}/kbs/${slug}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok)
    throw buildError("Update KB failed", res.status, await res.text());
  return res.json();
}

export async function deleteKB(slug: string): Promise<void> {
  const res = await fetchWithTimeout(`${LIGHTRAG_URL}/kbs/${slug}`, {
    method: "DELETE",
  });
  if (!res.ok)
    throw buildError("Delete KB failed", res.status, await res.text());
}

// ---------------------------------------------------------------------------
// Document API (with kb parameter)
// ---------------------------------------------------------------------------

export async function searchOnly(
  question: string,
  options?: {
    topK?: number;
    service?: "lightrag" | "pageindex";
    kb?: string;
    /**
     * Per-request query mode. Passed through to the backend QueryRequest.
     * undefined => backend default ("hybrid"). Only "local"|"global"|"hybrid"|"mix"
     * are honored server-side; any other value falls back to "hybrid".
     */
    mode?: "local" | "global" | "hybrid" | "mix";
    /**
     * Per-request rerank override. undefined => follow server config.RERANK_ENABLED.
     * true => force two-stage rerank for this request; false => force off.
     */
    rerank?: boolean;
  },
): Promise<SearchResponse> {
  const baseUrl =
    options?.service === "pageindex" ? QUERY_SERVICE_URL : LIGHTRAG_URL;
  const kb = options?.kb;
  const url = `${baseUrl}/query/search-only${kb ? `?kb=${encodeURIComponent(kb)}` : ""}`;

  // Resolve effective rerank flag: explicit option wins, else the rag-ui-side
  // RERANK_ENABLED feature flag (default false => fully backward compatible).
  const rerankOn = options?.rerank ?? (RERANK_ENABLED || undefined);

  // When rerank is effectively on and the caller did not pin a top_k, widen the
  // retrieval net to RETRIEVE_TOP_K so the server reranker has more candidates.
  // The server overrides top_k to RETRIEVE_TOP_K itself when rerank is active,
  // but sending it keeps the wire body explicit. Default path is unchanged.
  const topK =
    options?.topK ?? (rerankOn ? RETRIEVE_TOP_K : 5);

  // Build body. Only include mode/rerank when set so legacy bodies stay identical.
  const body: Record<string, unknown> = { question, top_k: topK };
  if (options?.mode) body.mode = options.mode;
  if (rerankOn !== undefined) body.rerank = rerankOn;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw buildError("Search failed", res.status, await res.text());
  return res.json();
}

export async function ingestDocument(
  formData: FormData,
  kb: string,
): Promise<IngestResponse> {
  const res = await fetchWithTimeout(
    `${LIGHTRAG_URL}/ingest?kb=${encodeURIComponent(kb)}`,
    { method: "POST", body: formData },
    30_000, // only waiting for OCR now
  );
  if (!res.ok) {
    const body = await res.text();
    // Preserve backend error message for 409 (duplicate file)
    if (res.status === 409) {
      const detail = (() => {
        try {
          return JSON.parse(body).detail;
        } catch {
          return body;
        }
      })();
      throw new Error(detail || "Duplicate file");
    }
    throw buildError("Ingest failed", res.status, body);
  }
  return res.json();
}

export async function listDocuments(
  kb: string,
): Promise<{ documents: DocumentInfo[] }> {
  const res = await fetchWithTimeout(
    `${LIGHTRAG_URL}/documents?kb=${encodeURIComponent(kb)}`,
  );
  if (!res.ok)
    throw buildError("List documents failed", res.status, await res.text());
  return res.json();
}

export async function deleteDocument(docId: string, kb: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${LIGHTRAG_URL}/documents/${docId}?kb=${encodeURIComponent(kb)}`,
    {
      method: "DELETE",
    },
  );
  if (!res.ok) throw buildError("Delete failed", res.status, await res.text());
}

// ---------------------------------------------------------------------------
// Graph API
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  entity_type: string;
  description: string;
  community: number;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  description: string;
  weight: number;
}

export interface GraphStats {
  node_count: number;
  edge_count: number;
  community_count: number;
  is_truncated: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphEdge[];
  stats: GraphStats;
}

export async function getGraph(
  kb: string,
  maxNodes = 2000,
): Promise<GraphData> {
  const res = await fetchWithTimeout(
    `${LIGHTRAG_URL}/graph?kb=${encodeURIComponent(kb)}&max_nodes=${maxNodes}`,
  );
  if (!res.ok)
    throw buildError("Get graph failed", res.status, await res.text());
  return res.json();
}

export async function deleteAllDocuments(
  kb: string,
): Promise<{ deleted: number }> {
  const res = await fetchWithTimeout(
    `${LIGHTRAG_URL}/documents?kb=${encodeURIComponent(kb)}`,
    {
      method: "DELETE",
    },
  );
  if (!res.ok)
    throw buildError("Delete all failed", res.status, await res.text());
  return res.json();
}
