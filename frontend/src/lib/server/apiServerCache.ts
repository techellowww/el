/**
 * In-memory server-side cache for high-frequency API endpoints.
 * Operates across serverless function invocations on warm lambdas and during local runtime.
 * Automatically handles TTL expiry and targeted invalidation.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const serverCache = new Map<string, CacheEntry<any>>();

export function getServerCache<T>(key: string): T | null {
  const entry = serverCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    serverCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setServerCache<T>(key: string, data: T, ttlMs: number = 15000): void {
  serverCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function invalidateServerCache(pattern: string): void {
  for (const key of serverCache.keys()) {
    if (key.includes(pattern)) {
      serverCache.delete(key);
    }
  }
}

export function clearServerCache(): void {
  serverCache.clear();
}
