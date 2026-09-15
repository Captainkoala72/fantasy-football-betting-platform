import { db } from "@/db";
import { espnCache } from "@/db/schema";
import { eq } from "drizzle-orm";

type Entry = { value: unknown; fetchedAt: number };

const globalForCache = globalThis as typeof globalThis & {
  __llMemCache?: Map<string, Entry>;
  __llInflight?: Map<string, Promise<unknown>>;
};

const mem = (globalForCache.__llMemCache ??= new Map<string, Entry>());
const inflight = (globalForCache.__llInflight ??= new Map<string, Promise<unknown>>());

export type CachedResult<T> = { value: T; fetchedAt: number; stale: boolean; error: string | null };

/**
 * Memory-first cache with a Postgres last-known-good fallback.
 * - Fresh memory hit → returned immediately.
 * - Otherwise the fetcher runs (deduplicated across concurrent callers).
 * - If the fetcher throws, we serve the stale memory or DB copy and flag it.
 */
export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  opts: { persist?: boolean } = {},
): Promise<CachedResult<T>> {
  const persist = opts.persist ?? true;
  const now = Date.now();
  const hit = mem.get(key);
  if (hit && now - hit.fetchedAt < ttlMs) {
    return { value: hit.value as T, fetchedAt: hit.fetchedAt, stale: false, error: null };
  }

  let promise = inflight.get(key) as Promise<CachedResult<T>> | undefined;
  if (!promise) {
    promise = (async () => {
      try {
        const value = await fetcher();
        const fetchedAt = Date.now();
        mem.set(key, { value, fetchedAt });
        if (persist) {
          try {
            await db
              .insert(espnCache)
              .values({ key, payload: value as object, fetchedAt: new Date(fetchedAt) })
              .onConflictDoUpdate({
                target: espnCache.key,
                set: { payload: value as object, fetchedAt: new Date(fetchedAt) },
              });
          } catch {
            // persistence is best-effort
          }
        }
        return { value, fetchedAt, stale: false, error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const staleMem = mem.get(key);
        if (staleMem) {
          return { value: staleMem.value as T, fetchedAt: staleMem.fetchedAt, stale: true, error: message };
        }
        if (persist) {
          try {
            const rows = await db.select().from(espnCache).where(eq(espnCache.key, key)).limit(1);
            if (rows[0]) {
              const fetchedAt = rows[0].fetchedAt.getTime();
              mem.set(key, { value: rows[0].payload, fetchedAt });
              return { value: rows[0].payload as T, fetchedAt, stale: true, error: message };
            }
          } catch {
            // fall through
          }
        }
        throw err;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise as Promise<unknown>);
  }
  return promise;
}

export function invalidateCache(prefix?: string) {
  if (!prefix) {
    mem.clear();
    return;
  }
  for (const key of Array.from(mem.keys())) {
    if (key.startsWith(prefix)) mem.delete(key);
  }
}
