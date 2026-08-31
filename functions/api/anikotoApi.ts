// Structured AniKoto API adapter.
// The API service performs the scraper/FlareSolverr work; this Pages Function
// only consumes its typed JSON, caches the metadata briefly, and proxies the
// resulting manifest/subtitle URLs through Miruro.

type Env = { ANIKOTO_API_BASE?: string };

type SearchResult = {
  title?: string;
  slug?: string;
  image?: string;
  type?: string;
  episode?: string | number;
  languages?: string[];
  aniListId?: string | number | null;
  malId?: string | number | null;
};

type Episode = {
  episode?: string | number;
  sub?: boolean;
  dub?: boolean;
};

type ApiServer = {
  type?: string;
  serverName?: string;
  m3u8Url?: string;
  embedUrl?: string;
  subtitles?: Array<{ file?: string; label?: string; language?: string; kind?: string; default?: boolean }>;
};

type ApiStreamPayload = {
  data?: {
    episodeTitle?: string;
    intro?: { start?: number; end?: number } | null;
    outro?: { start?: number; end?: number } | null;
    servers?: ApiServer[];
  };
};

type CachedValue = { value: unknown; expiresAt: number };
const API_DEFAULT = 'https://dainsleif6284-anikoto-api.hf.space';
const metadataCache = new Map<string, CachedValue>();
const pendingRequests = new Map<string, Promise<unknown>>();
const METADATA_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
};

export class AniKotoApiError extends Error {
  constructor(
    public readonly code: 'EPISODE_UNAVAILABLE' | 'LANGUAGE_UNAVAILABLE' | 'SOURCE_UNAVAILABLE' | 'RESOLVER_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'AniKotoApiError';
  }
}

function baseUrl(env: Env): URL {
  const configured = env.ANIKOTO_API_BASE?.trim() || API_DEFAULT;
  try {
    const parsed = new URL(configured);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('unsupported protocol');
    parsed.search = '';
    parsed.hash = '';
    return parsed;
  } catch {
    throw new AniKotoApiError('RESOLVER_ERROR', 'AniKoto API base URL is invalid.');
  }
}

function buildUrl(base: URL, path: string, params: Record<string, string> = {}): string {
  const url = new URL(path.replace(/^\//, ''), base.toString().endsWith('/') ? base.toString() : `${base}/`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function normalizeTitle(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleScore(query: string, candidate: string): number {
  const wanted = normalizeTitle(query);
  const actual = normalizeTitle(candidate);
  if (!wanted || !actual) return 0;
  if (wanted === actual) return 1000;
  const words = new Set(wanted.split(' '));
  return (actual.includes(wanted) ? 100 : 0) + actual.split(' ').reduce((sum, word) => sum + (words.has(word) ? 10 : 0), 0);
}

async function fetchJson<T>(target: string): Promise<T> {
  const cached = metadataCache.get(target);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const pending = pendingRequests.get(target);
  if (pending) return pending as Promise<T>;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(target, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'Miruro/AniKoto-adapter' },
      });
      if (!response.ok) throw new AniKotoApiError('RESOLVER_ERROR', `AniKoto API returned HTTP ${response.status}.`);
      const value = await response.json() as T;
      metadataCache.set(target, { value, expiresAt: Date.now() + METADATA_TTL_MS });
      return value;
    } catch (error) {
      if (error instanceof AniKotoApiError) throw error;
      throw new AniKotoApiError('RESOLVER_ERROR', 'AniKoto API request failed or timed out.');
    } finally {
      clearTimeout(timeout);
    }
  })();
  pendingRequests.set(target, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(target);
  }
}

async function findSeries(title: string, anilistId: string | undefined, base: URL): Promise<SearchResult> {
  const payload = await fetchJson<{ results?: SearchResult[] }>(buildUrl(base, 'api/anime/search', { q: title, page: '1' }));
  const results = Array.isArray(payload.results) ? payload.results.filter((result) => result.slug) : [];
  const idMatch = anilistId && results.find((result) => String(result.aniListId || '') === anilistId);
  const best = idMatch || [...results].sort((a, b) => titleScore(title, b.title || '') - titleScore(title, a.title || ''))[0];
  if (!best?.slug) throw new AniKotoApiError('EPISODE_UNAVAILABLE', `AniKoto has no match for “${title}”.`);
  return best;
}

function skipTimes(data: ApiStreamPayload['data']) {
  const result: Array<{ interval: { startTime: number; endTime: number }; skipType: 'op' | 'ed' }> = [];
  const add = (part: { start?: number; end?: number } | null | undefined, type: 'op' | 'ed') => {
    const start = Number(part?.start);
    const end = Number(part?.end);
    if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start) {
      result.push({ interval: { startTime: start, endTime: end }, skipType: type });
    }
  };
  add(data?.intro, 'op');
  add(data?.outro, 'ed');
  return result;
}

export async function resolveAniKotoApi(
  title: string,
  episodeNumber: number,
  mode: 'hsub' | 'ssub' | 'dub',
  selfUrl: URL,
  env: Env,
  anilistId?: string,
): Promise<Response> {
  if (mode === 'hsub') {
    throw new AniKotoApiError('LANGUAGE_UNAVAILABLE', 'AniKoto API does not identify a hard-sub stream mode.');
  }
  const base = baseUrl(env);
  const series = await findSeries(title, anilistId, base);
  const stream = await fetchJson<ApiStreamPayload>(buildUrl(base, `api/anime/stream/${series.slug}/${episodeNumber}`));
  const servers = (stream.data?.servers || []).filter((server) => String(server.type || '').toLowerCase() === (mode === 'dub' ? 'dub' : 'sub'));
  if (!servers.length) {
    throw new AniKotoApiError('LANGUAGE_UNAVAILABLE', `AniKoto has no ${mode === 'dub' ? 'dub' : 'subtitle'} stream for episode ${episodeNumber}.`);
  }

  const sources = servers.map((server) => {
    if (!server.m3u8Url || !/^https:\/\//i.test(server.m3u8Url)) return null;
    return {
      url: `${selfUrl.origin}/api/proxy?url=${encodeURIComponent(server.m3u8Url)}&referer=${encodeURIComponent(server.embedUrl || `${base.origin}/`)}`,
      quality: 'auto',
      isM3U8: true,
      server: server.serverName || 'AniKoto API',
    };
  }).filter(Boolean);
  if (!sources.length) throw new AniKotoApiError('SOURCE_UNAVAILABLE', 'AniKoto returned no playable HLS source.');

  const subtitleMap = new Map<string, { url: string; lang: string; name: string; format: string; default?: boolean }>();
  for (const server of servers) {
    for (const subtitle of server.subtitles || []) {
      if (!subtitle.file || !/^https:\/\//i.test(subtitle.file)) continue;
      subtitleMap.set(subtitle.file, {
        url: `${selfUrl.origin}/api/proxy?url=${encodeURIComponent(subtitle.file)}&referer=${encodeURIComponent(server.embedUrl || `${base.origin}/`)}`,
        lang: subtitle.language || 'en',
        name: subtitle.label || subtitle.language || 'English',
        format: subtitle.file.toLowerCase().includes('.ass') ? 'ass' : 'vtt',
        default: subtitle.default,
      });
    }
  }

  return new Response(JSON.stringify({
    sources,
    subtitles: [...subtitleMap.values()],
    skipTimes: skipTimes(stream.data),
    isDub: mode === 'dub',
    download: `${base.origin}/`,
    provider: 'anikoto',
    episodeTitle: stream.data?.episodeTitle,
  }), { status: 200, headers: CORS });
}

export async function getAniKotoApiAvailability(title: string, anilistId: string | undefined, env: Env) {
  const base = baseUrl(env);
  const series = await findSeries(title, anilistId, base);
  const payload = await fetchJson<unknown>(buildUrl(base, `api/anime/episodes/${series.slug}`));
  const episodes = Array.isArray(payload) ? payload as Episode[] : [];
  if (!episodes.length) throw new AniKotoApiError('SOURCE_UNAVAILABLE', 'AniKoto returned no episode metadata.');
  return {
    sub: episodes.filter((episode) => episode.sub === true).length,
    dub: episodes.filter((episode) => episode.dub === true).length,
    source: 'anikoto' as const,
  };
}
