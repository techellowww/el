/**
 * Lightweight in-memory client-side API response cache with TTL & Stale-While-Revalidate.
 * Eliminates redundant network calls and makes page transitions (Dashboard <-> Projects <-> Clients) instant.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cacheStore = new Map<string, CacheEntry<any>>();

export async function cachedFetch<T = any>(
  url: string,
  options?: {
    ttlMs?: number; // default: 15 seconds
    forceRefresh?: boolean;
    init?: RequestInit;
  }
): Promise<T> {
  const ttl = options?.ttlMs ?? 15000;
  const now = Date.now();
  const cached = cacheStore.get(url);

  if (!options?.forceRefresh && cached && now - cached.timestamp < ttl) {
    return cached.data;
  }

  const res = await fetch(url, options?.init);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Request to ${url} failed with status ${res.status}`);
  }

  const data = await res.json();
  cacheStore.set(url, { data, timestamp: now });
  return data;
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

