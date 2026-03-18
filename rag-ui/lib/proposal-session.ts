import { nanoid } from "nanoid";

interface ProposalSession {
  data: Record<string, unknown>;
  analysis: Record<string, unknown>;
  additionalContext: string;
  createdAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
const sessions = new Map<string, ProposalSession>();

/** Evict expired sessions (called on every access) */
function evict() {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.createdAt > TTL_MS) sessions.delete(key);
  }
}

export function storeSession(
  data: Record<string, unknown>,
  analysis: Record<string, unknown>,
  additionalContext: string,
): string {
  evict();
  const key = nanoid(12);
  sessions.set(key, { data, analysis, additionalContext, createdAt: Date.now() });
  return key;
}

export function getSession(key: string): ProposalSession | null {
  evict();
  return sessions.get(key) ?? null;
}

export function updateSessionAnalysis(
  key: string,
  analysis: Record<string, unknown>,
): boolean {
  const session = sessions.get(key);
  if (!session) return false;
  session.analysis = analysis;
  return true;
}
