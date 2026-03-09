import { createClient, type RedisClientType } from "redis";
import { REDIS_URL } from "./constants";
import { generateEmbedding, cosineSimilarity } from "./embedding-client";

const ENTRY_PREFIX = "rag:cache:v2:entry:";
const EXACT_PREFIX = "rag:cache:v2:exact:";
const INDEX_KEY = "rag:cache:v2:index";
const CACHE_TTL = 3600; // 1 hour
const SIMILARITY_THRESHOLD = 0.85;

let client: RedisClientType | null = null;
let connectionFailed = false;

export let CACHE_ENABLED = true;

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

async function getClient(): Promise<RedisClientType | null> {
  if (connectionFailed) return null;
  if (client?.isOpen) return client;

  try {
    client = createClient({ url: REDIS_URL });
    client.on("error", (err) => {
      console.error("[semantic-cache] Redis error:", err.message);
    });
    await client.connect();
    await client.ping();
    CACHE_ENABLED = true;
    return client;
  } catch (err) {
    console.error("[semantic-cache] Failed to connect to Redis:", (err as Error).message);
    CACHE_ENABLED = false;
    connectionFailed = true;
    client = null;
    return null;
  }
}

type CacheHit = {
  hit: true;
  response: string;
  sources: object[];
  matchType: "exact" | "semantic";
  similarity?: number;
};
type CacheMiss = { hit: false };

export async function getCachedResponse(query: string): Promise<CacheHit | CacheMiss> {
  try {
    const redis = await getClient();
    if (!redis) return { hit: false };

    // --- Fast path: exact match ---
    const normalized = normalizeQuery(query);
    const exactId = await redis.get(`${EXACT_PREFIX}${normalized}`);
    if (exactId) {
      const entryData = await redis.get(`${ENTRY_PREFIX}${exactId}`);
      if (entryData) {
        const entry = JSON.parse(entryData) as CacheEntry;
        console.log("[semantic-cache] Exact match hit");
        return {
          hit: true,
          response: entry.response,
          sources: entry.sources,
          matchType: "exact",
        };
      }
      // Entry expired but exact key still exists — clean up
      await redis.sRem(INDEX_KEY, exactId);
    }

    // --- Semantic path: embedding similarity ---
    let queryEmbedding: number[];
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (err) {
      console.error("[semantic-cache] Embedding generation failed:", (err as Error).message);
      return { hit: false };
    }

    const entryIds = await redis.sMembers(INDEX_KEY);
    if (entryIds.length === 0) return { hit: false };

    // Batch fetch all entries
    const keys = entryIds.map((id) => `${ENTRY_PREFIX}${id}`);
    const values = await redis.mGet(keys);

    let bestSimilarity = -1;
    let bestEntry: CacheEntry | null = null;
    const expiredIds: string[] = [];

    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      if (!val) {
        // Entry expired, mark for cleanup
        expiredIds.push(entryIds[i]);
        continue;
      }
      const entry = JSON.parse(val) as CacheEntry;
      if (!entry.embedding) continue;

      const sim = cosineSimilarity(queryEmbedding, entry.embedding);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestEntry = entry;
      }
    }

    // Lazy cleanup of expired entries
    if (expiredIds.length > 0) {
      await redis.sRem(INDEX_KEY, expiredIds);
    }

    if (bestEntry && bestSimilarity >= SIMILARITY_THRESHOLD) {
      console.log(`[semantic-cache] Semantic match hit: similarity=${bestSimilarity.toFixed(4)}`);
      return {
        hit: true,
        response: bestEntry.response,
        sources: bestEntry.sources,
        matchType: "semantic",
        similarity: bestSimilarity,
      };
    }

    return { hit: false };
  } catch (err) {
    console.error("[semantic-cache] getCachedResponse error:", (err as Error).message);
    return { hit: false };
  }
}

interface CacheEntry {
  query: string;
  embedding: number[];
  response: string;
  sources: object[];
  timestamp: number;
}

export async function cacheResponse(
  query: string,
  response: string,
  sources: object[],
): Promise<void> {
  try {
    const redis = await getClient();
    if (!redis) return;

    let embedding: number[];
    try {
      embedding = await generateEmbedding(query);
    } catch (err) {
      console.error(
        "[semantic-cache] Embedding generation failed, caching without embedding:",
        (err as Error).message,
      );
      // Still cache for exact match even if embedding fails
      embedding = [];
    }

    const id = crypto.randomUUID();
    const entry: CacheEntry = {
      query,
      embedding,
      response,
      sources,
      timestamp: Date.now(),
    };

    const normalized = normalizeQuery(query);

    await Promise.all([
      redis.set(`${ENTRY_PREFIX}${id}`, JSON.stringify(entry), {
        EX: CACHE_TTL,
      }),
      redis.sAdd(INDEX_KEY, id),
      redis.set(`${EXACT_PREFIX}${normalized}`, id, { EX: CACHE_TTL }),
    ]);
  } catch (err) {
    console.error("[semantic-cache] cacheResponse error:", (err as Error).message);
  }
}

export async function invalidateCache(): Promise<void> {
  try {
    const redis = await getClient();
    if (!redis) return;

    const entryIds = await redis.sMembers(INDEX_KEY);
    const keysToDelete = [INDEX_KEY, ...entryIds.map((id) => `${ENTRY_PREFIX}${id}`)];

    // Also clean up exact match keys
    const exactKeys = await redis.keys(`${EXACT_PREFIX}*`);
    keysToDelete.push(...exactKeys);

    if (keysToDelete.length > 0) {
      await redis.del(keysToDelete);
    }
  } catch (err) {
    console.error("[semantic-cache] invalidateCache error:", (err as Error).message);
  }
}
