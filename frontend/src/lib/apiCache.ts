/**
 * Lightweight in-memory client-side API response cache with TTL & request deduplication.
 * Eliminates redundant network calls and makes page transitions across all modules instant.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cacheStore = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

export function getCachedData<T = any>(url: string, ttlMs: number = 60000): T | null {
  const cached = cacheStore.get(url);
  if (!cached) return null;
  if (Date.now() - cached.timestamp >= ttlMs) {
    return null;
  }
  return cached.data;
}

export function setCachedData<T = any>(url: string, data: T): void {
  cacheStore.set(url, { data, timestamp: Date.now() });
}

export function prefetchApi(url: string, ttlMs?: number): void {
  cachedFetch(url, { ttlMs }).catch(() => {});
}

export async function cachedFetch<T = any>(
  url: string,
  options?: {
    ttlMs?: number; // default: 60 seconds
    forceRefresh?: boolean;
    init?: RequestInit;
  }
): Promise<T> {
  const ttl = options?.ttlMs ?? 60000;
  const now = Date.now();
  const cached = cacheStore.get(url);

  if (!options?.forceRefresh && cached && now - cached.timestamp < ttl) {
    return cached.data;
  }

  // Deduplicate concurrent in-flight requests for the exact same URL
  if (!options?.forceRefresh && inFlightRequests.has(url)) {
    return inFlightRequests.get(url)!;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(url, options?.init);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Request to ${url} failed with status ${res.status}`);
      }

      const data = await res.json();
      cacheStore.set(url, { data, timestamp: Date.now() });
      return data;
    } finally {
      inFlightRequests.delete(url);
    }
  })();

  inFlightRequests.set(url, fetchPromise);
  return fetchPromise;
}

export function invalidateApiCache(urlPrefix?: string): void {
  if (!urlPrefix) {
    cacheStore.clear();
    return;
  }
  for (const key of Array.from(cacheStore.keys())) {
    if (key.startsWith(urlPrefix)) {
      cacheStore.delete(key);
    }
  }
}

