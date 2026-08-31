import {
  queryAniListTrending,
  queryAniListPopular,
  queryAniListTopRated,
  queryAniListTopAiring,
  queryAniListUpcoming,
  queryAniListSearch,
  queryAniListAnimeDetails,
  queryAniListFranchiseSeasons,
} from '../client/anilistSync';
import {
  fetchAnimeEpisodeList,
  fetchEpisodeStreamingSources,
  fetchEpisodeSkipTimes,
} from '../client/streamService';
import { safeLocalStorageGetJson, safeLocalStorageSet } from '../client/safeStorage';
import type { Anime, Episode, Paging } from './animeInterface';

// Session memory cache with safety limits
const memoryCache = new Map<string, { value: any; timestamp: number }>();
const CACHE_MAX_AGE = 30 * 60 * 1000; // 30 minutes
const pendingAnimeData = new Map<string, Promise<Anime>>();
// React can mount/unmount route trees while they are settling, and several
// components can request the same resource at once. Share those in-flight
// promises so a slow device or a cold cache does not multiply upstream work.
const pendingRequests = new Map<string, Promise<unknown>>();

async function fetchCached<T>(
  key: string,
  loader: () => Promise<T>,
  shouldCache: (value: T) => boolean = () => true,
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;

  const existing = pendingRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const request = loader()
    .then((result) => {
      if (shouldCache(result)) setCached(key, result);
      return result;
    })
    .finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, request);
  return request;
}

function getCached<T>(key: string): T | undefined {
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.timestamp < CACHE_MAX_AGE) {
    return mem.value;
  }
  const sessionVal = safeLocalStorageGetJson<{ value: T; timestamp: number } | null>(`cache_${key}`, null);
  if (sessionVal && Date.now() - sessionVal.timestamp < CACHE_MAX_AGE) {
    memoryCache.set(key, sessionVal);
    return sessionVal.value;
  }
  return undefined;
}

function setCached(key: string, value: any): void {
  const item = { value, timestamp: Date.now() };
  if (memoryCache.size > 50) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, item);
  safeLocalStorageSet(`cache_${key}`, JSON.stringify(item));
}

export interface FetchOptions {
  type?: string;
  season?: string;
  format?: string;
  sort?: string[];
  genres?: string[];
  id?: string;
  year?: string;
  status?: string;
}

// Function to fetch anime data with advanced search
export async function fetchAdvancedSearch(
  searchQuery: string = '',
  page: number = 1,
  perPage: number = 20,
  options: FetchOptions = {},
): Promise<Paging> {
  const cacheKey = `search_${searchQuery}_${page}_${perPage}_${JSON.stringify(options)}`;
  return fetchCached(cacheKey, () => queryAniListSearch(searchQuery, page, perPage, options));
}

// Fetch Anime DATA Function
export async function fetchAnimeData(
  animeId: string,
  _provider: string = 'anikoto',
  includeFranchiseSeasons: boolean = false,
): Promise<Anime> {
  // v2 includes AniList's per-episode airing schedule. Version the key so
  // older cached detail objects cannot hide release timestamps.
  const cacheKey = `animeData_v3_${animeId}_${includeFranchiseSeasons ? 'franchise' : 'base'}`;
  const cached = getCached<Anime>(cacheKey);
  if (cached) return cached;
  const existing = pendingAnimeData.get(cacheKey);
  if (existing) return existing;

  const request = (async () => {
    // The franchise view needs the same base record as the player. Reuse that
    // cached/in-flight request instead of querying the full AniList detail
    // payload twice.
    const result = includeFranchiseSeasons
      ? { ...(await fetchAnimeData(animeId, _provider, false)) }
      : await queryAniListAnimeDetails(animeId);
    if (includeFranchiseSeasons) {
      result.franchiseSeasons = await queryAniListFranchiseSeasons(result);
    }
    setCached(cacheKey, result);
    return result;
  })().finally(() => pendingAnimeData.delete(cacheKey));
  pendingAnimeData.set(cacheKey, request);
  return request;
}

// Fetch Anime INFO Function
export async function fetchAnimeInfo(
  animeId: string,
  provider: string = 'gogoanime',
): Promise<Anime> {
  return fetchAnimeData(animeId, provider);
}

// Functions to fetch top, trending, and popular anime
export async function fetchTrendingAnime(page: number = 1, perPage: number = 20): Promise<Paging> {
  const cacheKey = `trending_${page}_${perPage}`;
  return fetchCached(cacheKey, () => queryAniListTrending(page, perPage));
}

export async function fetchPopularAnime(page: number = 1, perPage: number = 20): Promise<Paging> {
  const cacheKey = `popular_${page}_${perPage}`;
  return fetchCached(cacheKey, () => queryAniListPopular(page, perPage));
}

export async function fetchTopAnime(page: number = 1, perPage: number = 20): Promise<Paging> {
  const cacheKey = `topRated_${page}_${perPage}`;
  return fetchCached(cacheKey, () => queryAniListTopRated(page, perPage));
}

export async function fetchTopAiringAnime(page: number = 1, perPage: number = 20): Promise<Paging> {
  const cacheKey = `topAiring_${page}_${perPage}`;
  return fetchCached(cacheKey, () => queryAniListTopAiring(page, perPage));
}

export async function fetchUpcomingSeasons(
  page: number = 1,
  perPage: number = 20,
  season?: string,
  year?: number,
): Promise<Paging> {
  const cacheKey = `upcoming_${page}_${perPage}_${season || ''}_${year || ''}`;
  return fetchCached(cacheKey, () => queryAniListUpcoming(page, perPage, season, year));
}

// Fetch Anime Episodes Function
export async function fetchAnimeEpisodes(
  animeId: string,
  provider: string = 'anikoto',
  dub: boolean = false,
) {
  // v2 merges AniList airing timestamps into each episode.
  const cacheKey = `episodes_v3_${animeId}_${provider || 'anikoto'}_${dub ? 'dub' : 'sub'}`;
  return fetchCached(cacheKey, async () => {
    // First get anime details to know title and episode count
    let animeTitle = '';
    let totalEpisodes = 1;
    let details: Anime | null = null;
    try {
      details = await fetchAnimeData(animeId);
      animeTitle = details.title.english || details.title.romaji || '';
      totalEpisodes = details.totalEpisodes || 1;
    } catch {
      // Continue with defaults
    }

    const result = await fetchAnimeEpisodeList(animeId, animeTitle, totalEpisodes, provider, dub);
    const airDates = new Map(
      (details?.episodes || [])
        .filter((episode) => episode.number > 0 && episode.airDate)
        .map((episode) => [episode.number, episode.airDate as string]),
    );
    const enrichedResult = result.map((episode) => ({
      ...episode,
      airDate: episode.airDate || airDates.get(Number(episode.number)) || null,
    }));
    return filterReleasedEpisodes(enrichedResult, details);
  }, (result) => Array.isArray(result) && result.length > 0);
}

/**
 * AniList's `episodes` value is the eventual completed count, not the number
 * currently released. Use its airing schedule as a release boundary while
 * retaining the provider's own candidates when they are more restrictive.
 */
export function filterReleasedEpisodes(
  episodes: Episode[],
  details: Anime | null,
  now: number = Date.now(),
): Episode[] {
  const scheduled = (details?.episodes || []).filter((episode) => {
    const airingAt = episode.airingAt || (episode.airDate ? Date.parse(episode.airDate) / 1000 : 0);
    return Number.isFinite(airingAt) && airingAt > 0;
  });
  if (scheduled.length === 0) return episodes;

  const releasedNumbers = new Set(
    scheduled
      .filter((episode) => {
        const airingAt = episode.airingAt || (episode.airDate ? Date.parse(episode.airDate) / 1000 : 0);
        return airingAt * 1000 <= now;
      })
      .map((episode) => episode.number),
  );
  const latestReleased = Math.max(0, ...releasedNumbers);

  return episodes.filter((episode) => {
    const scheduledEpisode = scheduled.find((item) => item.number === episode.number);
    if (scheduledEpisode) return releasedNumbers.has(episode.number);
    return episode.number <= latestReleased;
  });
}

// Function to fetch streaming links for an anime episode
export async function fetchAnimeStreamingLinks(
  episodeId: string,
  provider: string = 'anikoto',
  animeTitle: string = '',
  isDub: boolean = false,
  anilistId: string = '',
  subtitleMode: 'hsub' | 'ssub' | 'dub' = isDub ? 'dub' : 'ssub',
): Promise<any> {
  // v2 includes provider-supplied intro/outro skip windows. Bump the key so
  // older cached responses cannot hide the new chapter metadata.
  const cacheKey = `streamLinks_v3_${episodeId}_${provider}_${animeTitle}_${isDub}_${subtitleMode}_${anilistId}`;
  return fetchCached(
    cacheKey,
    () => fetchEpisodeStreamingSources(episodeId, provider, animeTitle, isDub, anilistId, subtitleMode),
    (result) => Boolean(result?.sources?.length),
  );
}

// Function to fetch skip times for an anime episode
export async function fetchSkipTimes({
  malId,
  episodeNumber,
  episodeLength = 0,
  anilistId = '',
}: {
  malId: string | number;
  episodeNumber: string | number;
  episodeLength?: number | string;
  anilistId?: string | number;
}) {
  const lengthNum = typeof episodeLength === 'string' ? parseFloat(episodeLength) || 0 : episodeLength;
  // Version the key so an empty result from a transient AniSkip outage does
  // not keep the player chapterless for the full cache lifetime.
  const cacheKey = `skipTimes_v3_${malId}_${anilistId}_${episodeNumber}_${lengthNum}`;
  return fetchCached(
    cacheKey,
    () => fetchEpisodeSkipTimes(malId, episodeNumber, lengthNum, anilistId),
    (result) => Boolean(result?.found || result?.results?.length > 0),
  );
}

// Fetch Recent Anime Episodes
export async function fetchRecentEpisodes(page: number = 1, perPage: number = 18) {
  return fetchTopAiringAnime(page, perPage);
}
