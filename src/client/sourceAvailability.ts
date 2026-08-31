export type SourceAvailability = {
  sub: number;
  dub: number;
  source: 'anikoto' | 'kaa';
  fetchedAt: number;
};

// Availability changes much less often than a watch session. Keep it on the
// device for six hours; the edge remains the shared cache layer.
const CACHE_TTL = 6 * 60 * 60 * 1000;
const MAX_CONCURRENT_REQUESTS = 2;
const cache = new Map<string, SourceAvailability>();
const pending = new Map<string, Promise<SourceAvailability | null>>();
let activeRequests = 0;
const requestQueue: Array<{
  key: string;
  run: () => Promise<SourceAvailability | null>;
  resolve: (value: SourceAvailability | null) => void;
}> = [];

function drainQueue(): void {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
    const job = requestQueue.shift();
    if (!job) return;
    activeRequests += 1;
    void job.run()
      .then(job.resolve)
      .catch(() => job.resolve(null))
      .finally(() => {
        activeRequests -= 1;
        pending.delete(job.key);
        drainQueue();
      });
  }
}

export async function fetchAniKotoAvailability(
  animeId: string,
  title: string,
): Promise<SourceAvailability | null> {
  const key = `${animeId}:${title}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached;
  const existing = pending.get(key);
  if (existing) return existing;

  const request = new Promise<SourceAvailability | null>((resolve) => {
    requestQueue.push({
      key,
      resolve,
      run: async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 10000);
        try {
          const params = new URLSearchParams({ title });
          if (/^\d+$/.test(animeId)) params.set('anilistId', animeId);
          const response = await fetch(`/api/availability?${params.toString()}`, {
            signal: controller.signal,
          });
          if (!response.ok) return null;
          const data = await response.json();
          if (!Number.isFinite(data?.sub) || !Number.isFinite(data?.dub)) return null;
          const result: SourceAvailability = {
            sub: Math.max(0, Math.floor(data.sub)),
            dub: Math.max(0, Math.floor(data.dub)),
            source: data.source === 'kaa' ? 'kaa' : 'anikoto',
            fetchedAt: Number(data.fetchedAt) || Date.now(),
          };
          cache.set(key, result);
          return result;
        } finally {
          window.clearTimeout(timeout);
        }
      },
    });
    drainQueue();
  });
  pending.set(key, request);
  return request;
}
