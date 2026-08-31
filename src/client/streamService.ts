import { safeLocalStorageGet } from './safeStorage';
import type { Episode } from '../hooks/animeInterface';

export interface StreamingQualitySource {
  url: string;
  isM3U8?: boolean;
  quality: string;
}

export interface StreamingLinksResponse {
  headers?: Record<string, string>;
  sources: StreamingQualitySource[];
  download?: string;
  subtitles?: Array<{ url: string; lang: string; name?: string; format?: string; default?: boolean }>;
  /** Provider-supplied opening/ending windows, when available. */
  skipTimes?: SkipTime[];
  chapters?: string;
  storyboard?: string;
  unavailable?: StreamUnavailable;
}

export type StreamUnavailableCode =
  | 'EPISODE_UNAVAILABLE'
  | 'LANGUAGE_UNAVAILABLE'
  | 'SOURCE_UNAVAILABLE'
  | 'RESOLVER_ERROR';

export interface StreamUnavailable {
  code: StreamUnavailableCode;
  message: string;
  retryable: boolean;
  provider?: string;
  mode?: 'hsub' | 'ssub' | 'dub';
  episode?: number;
}

export interface SkipTimeInterval {
  startTime: number;
  endTime: number;
}

export interface SkipTime {
  interval: SkipTimeInterval;
  skipType: string;
  episodeLength?: number;
}

export interface FetchSkipTimesResponse {
  found: boolean;
  results: SkipTime[];
}

const DEFAULT_ANISKIP_URL = 'https://api.aniskip.com/';

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function unavailableFromHttpResponse(
  response: Response,
  provider: string,
  mode: 'hsub' | 'ssub' | 'dub',
  episodeId: string,
): Promise<StreamingLinksResponse> {
  return response.clone().json().catch(() => ({})).then((payload: any) => {
    const unavailable = payload?.unavailable || payload?.error;
    const episodeMatch = episodeId.match(/episode-(\d+)/i) || episodeId.match(/-(\d+)$/);
    const episode = episodeMatch ? Number(episodeMatch[1]) : undefined;
    const code = unavailable?.code || (mode === 'dub' ? 'LANGUAGE_UNAVAILABLE' : 'SOURCE_UNAVAILABLE');
    return {
      sources: [],
      download: '',
      unavailable: {
        code,
        message: unavailable?.message || payload?.message || 'Cannot play media. Try a different source.',
        retryable: unavailable?.retryable ?? response.status >= 500,
        provider,
        mode,
        episode,
      },
    };
  });
}

// Get current configured backend/proxy endpoint
export function getBackendBaseUrl(): string {
  const custom = safeLocalStorageGet('custom_backend_url', '');
  if (custom) return custom.endsWith('/') ? custom : `${custom}/`;
  const envUrl = (import.meta.env.VITE_BACKEND_URL as string) || '';
  if (envUrl && !envUrl.includes('public-miruro-consumet-api.vercel.app')) {
    return envUrl.endsWith('/') ? envUrl : `${envUrl}/`;
  }
  // Public anime streaming API fallback endpoint list
  return 'https://api.amvstr.me/api/v2/';
}

// Generate episode list fallback for an anime based on total episodes
export function generateEpisodesList(animeId: string, animeTitle: string, totalEpisodes: number = 1): Episode[] {
  const cleanTitle = (animeTitle || `anime-${animeId}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const count = Math.max(1, totalEpisodes || 1);
  const eps: Episode[] = [];

  for (let i = 1; i <= count; i++) {
    eps.push({
      id: `${cleanTitle}-episode-${i}`,
      title: `Episode ${i}`,
      number: i,
      description: `Episode ${i} of ${animeTitle}`,
      image: '',
      imageHash: '',
      airDate: null,
    });
  }

  return eps;
}

// Fetch episodes list for an anime
export async function fetchAnimeEpisodeList(
  animeId: string,
  animeTitle: string = '',
  totalEpisodes: number = 1,
  provider: string = 'anikoto',
  dub: boolean = false,
): Promise<Episode[]> {
  const customBackend = safeLocalStorageGet('custom_backend_url', '');
  const baseUrl = customBackend || (import.meta.env.VITE_BACKEND_URL as string) || '';

  // If a valid custom backend is configured, attempt to fetch from it
  if (baseUrl && !baseUrl.includes('public-miruro-consumet-api.vercel.app')) {
    try {
      const slashBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const url = `${slashBase}meta/anilist/episodes/${animeId}?provider=${provider}&dub=${dub ? 'true' : 'false'}`;
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map((ep: any) => ({
            id: ep.id || `${animeId}-episode-${ep.number}`,
            title: ep.title || `Episode ${ep.number}`,
            number: ep.number || 1,
            description: ep.description || null,
            image: ep.image || '',
            imageHash: ep.imageHash || '',
            airDate: ep.airDate || null,
          }));
        }
      }
    } catch (err) {
      console.warn('[streamService] Backend episode fetch failed, falling back to generated list:', err);
    }
  }

  // Fallback to reliably generated episode list
  return generateEpisodesList(animeId, animeTitle, totalEpisodes);
}

// Fetch streaming sources for an episode
export async function fetchEpisodeStreamingSources(
  episodeId: string,
  provider: string = 'anikoto',
  animeTitle: string = '',
  isDub: boolean = false,
  anilistId: string = '',
  subtitleMode: 'hsub' | 'ssub' | 'dub' = isDub ? 'dub' : 'ssub',
): Promise<StreamingLinksResponse> {
  const customBackend = safeLocalStorageGet('custom_backend_url', '');
  const baseUrl = customBackend || (import.meta.env.VITE_BACKEND_URL as string) || '';

  // 1. If custom backend is set (e.g. localhost:8000), query it first
  if (baseUrl && !baseUrl.includes('public-miruro-consumet-api.vercel.app')) {
    try {
      const slashBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const url = `${slashBase}meta/anilist/watch/${episodeId}?provider=${provider}&dub=${isDub ? 'true' : 'false'}&mode=${subtitleMode}`;
      const res = await fetchWithTimeout(url, {}, 8000);
      if (res.ok) {
        const data = await res.json();
        if (data && data.sources && data.sources.length > 0) {
          return data;
        }
      } else {
        return unavailableFromHttpResponse(res, provider, subtitleMode, episodeId);
      }
    } catch (err) {
      console.warn('[streamService] Custom backend streaming link fetch failed:', err);
    }
  }

  // 2. Primary serverless edge resolver.
  try {
    // Extract episode number
    let epNum = '1';
    const epMatch = episodeId.match(/episode-(\d+)/i) || episodeId.match(/-(\d+)$/);
    if (epMatch) epNum = epMatch[1];

    const cleanTitle = animeTitle || episodeId.replace(/-episode-\d+/i, '').replace(/-/g, ' ');
    const effectiveDub = isDub || provider === 'dub';

    // Keep provider names aligned with the source selector. Anikoto is the
    // default source; KAA is exposed explicitly as `kaa`.
    const edgeProvider = provider === 'default' ? 'anikoto' : (provider || 'anikoto');

    const idParam = /^\d+$/.test(anilistId) ? `&anilistId=${encodeURIComponent(anilistId)}` : '';
    const edgeUrl = `/api/stream?title=${encodeURIComponent(cleanTitle)}&episode=${epNum}&provider=${edgeProvider}&dub=${effectiveDub ? 'true' : 'false'}&mode=${encodeURIComponent(subtitleMode)}${idParam}`;

    const res = await fetchWithTimeout(edgeUrl, {}, 12000);
    if (res.ok) {
      const data = await res.json();
      if (data && data.sources && data.sources.length > 0) {
        return data;
      }
    } else {
      // Preserve the selected provider/mode failure. Falling through to a
      // different provider can silently turn a requested dub into subtitles.
      return await unavailableFromHttpResponse(res, provider, subtitleMode, episodeId);
    }
  } catch (edgeErr) {
    console.warn('[streamService] Edge stream resolver failed, trying direct fallback:', edgeErr);
  }

  // No sources found — return a structured error so the player can recover.
  console.warn('[streamService] All streaming resolvers failed for:', episodeId);
  return {
    sources: [],
    download: '',
    unavailable: {
      code: 'SOURCE_UNAVAILABLE',
      message: 'Cannot play media. Try a different source.',
      retryable: true,
      provider,
      mode: subtitleMode,
    },
  };
}

// Fetch skip times for intro/outro from AniSkip
export async function fetchEpisodeSkipTimes(
  malId: string | number,
  episodeNumber: string | number,
  episodeLength: number = 0,
  anilistId: string | number = '',
): Promise<FetchSkipTimesResponse> {
  if ((!malId && !anilistId) || !episodeNumber) {
    return { found: false, results: [] };
  }

  try {
    const query = new URLSearchParams({
      malId: malId.toString(),
      episode: episodeNumber.toString(),
      episodeLength: (episodeLength || 0).toString(),
      ...(anilistId ? { anilistId: anilistId.toString() } : {}),
    });
    const endpoints = [`/api/chapters?${query.toString()}`];
    if (malId) {
      endpoints.push(
        (() => {
          const url = new URL(`v1/skip-times/${malId}/${episodeNumber}`, DEFAULT_ANISKIP_URL);
          url.searchParams.append('types', 'op');
          url.searchParams.append('types', 'ed');
          return url.toString();
        })(),
        (() => {
          const url = new URL(`v2/skip-times/${malId}/${episodeNumber}/`, DEFAULT_ANISKIP_URL);
          url.searchParams.append('episodeLength', (episodeLength || 0).toString());
          ['op', 'ed', 'mixed-op', 'mixed-ed', 'recap'].forEach((type) => url.searchParams.append('types', type));
          return url.toString();
        })(),
      );
    }

    for (const endpoint of endpoints) {
      const res = await fetchWithTimeout(endpoint, {}, 5000);
      if (!res.ok) continue;
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      if (results.length > 0 || endpoint === endpoints[endpoints.length - 1]) {
        return { found: data.found ?? (results.length > 0), results };
      }
    }
    return { found: false, results: [] };
  } catch (err) {
    console.warn('[streamService] AniSkip fetch failed or timed out:', err);
    return { found: false, results: [] };
  }
}
