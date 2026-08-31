import type { Anime, Paging, Character, Relation, Recommendation } from '../hooks/animeInterface';
import { safeLocalStorageGet } from './safeStorage';

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

async function fetchAniListWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAniListGraphQL<T = any>(
  query: string,
  variables: Record<string, any> = {},
  accessToken?: string,
): Promise<T> {
  const token = accessToken || safeLocalStorageGet('accessToken', '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetchAniListWithTimeout(ANILIST_GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`AniList API error (${response.status}): ${errorText}`) as Error & {
      status?: number;
      body?: string;
    };
    error.status = response.status;
    error.body = errorText;
    throw error;
  }

  const json = await response.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message || 'AniList GraphQL Error');
  }

  return json.data;
}

// Convert AniList media status to readable string
function formatStatus(status: string | null): string {
  switch (status) {
    case 'RELEASING':
      return 'Ongoing';
    case 'FINISHED':
      return 'Completed';
    case 'NOT_YET_RELEASED':
      return 'Not yet aired';
    case 'CANCELLED':
      return 'Cancelled';
    case 'HIATUS':
      return 'Hiatus';
    default:
      return status || 'Unknown';
  }
}

// Transform an AniList Media object into Miruro's standard Anime interface
export function transformAniListMediaToAnime(media: any): Anime {
  if (!media) return {} as Anime;

  const characters: Character[] = (media.characters?.edges || []).map((edge: any) => ({
    id: edge.node?.id?.toString() || '',
    role: edge.role || '',
    name: {
      romaji: edge.node?.name?.full || '',
      english: edge.node?.name?.full || '',
      native: edge.node?.name?.native || '',
      userPreferred: edge.node?.name?.userPreferred || edge.node?.name?.full || '',
    },
    image: edge.node?.image?.large || edge.node?.image?.medium || '',
    imageHash: '',
    voiceActors: (edge.voiceActors || []).map((va: any) => ({
      id: va.id?.toString() || '',
      language: va.languageV2 || 'Japanese',
      name: {
        romaji: va.name?.full || '',
        english: va.name?.full || '',
        native: va.name?.native || '',
        userPreferred: va.name?.userPreferred || va.name?.full || '',
      },
      image: va.image?.large || va.image?.medium || '',
      imageHash: '',
    })),
  }));

  const relations: Relation[] = (media.relations?.edges || []).map((edge: any) => ({
    id: edge.node?.id?.toString() || '',
    malId: edge.node?.idMal?.toString() || '',
    relationType: edge.relationType || '',
    title: {
      romaji: edge.node?.title?.romaji || '',
      english: edge.node?.title?.english || edge.node?.title?.romaji || '',
      native: edge.node?.title?.native || '',
      userPreferred: edge.node?.title?.userPreferred || '',
    },
    status: formatStatus(edge.node?.status),
    episodes: edge.node?.episodes || 0,
    image: edge.node?.coverImage?.large || edge.node?.coverImage?.medium || '',
    imageHash: '',
    cover: edge.node?.bannerImage || edge.node?.coverImage?.extraLarge || '',
    coverHash: '',
    rating: edge.node?.averageScore ? edge.node.averageScore / 10 : 0,
    type: edge.node?.format || edge.node?.type || 'TV',
    releaseDate: edge.node?.startDate?.year || edge.node?.seasonYear || 0,
    season: edge.node?.season || '',
    seasonYear: edge.node?.seasonYear || 0,
  }));

  const recommendations: Recommendation[] = (media.recommendations?.nodes || [])
    .filter((node: any) => node.mediaRecommendation)
    .map((node: any) => {
      const rec = node.mediaRecommendation;
      return {
        id: rec.id?.toString() || '',
        malId: rec.idMal?.toString() || '',
        title: {
          romaji: rec.title?.romaji || '',
          english: rec.title?.english || rec.title?.romaji || '',
          native: rec.title?.native || '',
          userPreferred: rec.title?.userPreferred || '',
        },
        status: formatStatus(rec.status),
        episodes: rec.episodes || 0,
        image: rec.coverImage?.large || rec.coverImage?.medium || '',
        imageHash: '',
        cover: rec.bannerImage || rec.coverImage?.extraLarge || '',
        coverHash: '',
        rating: rec.averageScore ? rec.averageScore / 10 : 0,
        type: rec.format || 'TV',
      };
    });

  const totalEps = media.episodes || (media.nextAiringEpisode ? media.nextAiringEpisode.episode - 1 : 0);

  return {
    id: media.id?.toString() || '',
    malId: media.idMal?.toString() || '',
    title: {
      romaji: media.title?.romaji || '',
      english: media.title?.english || media.title?.romaji || '',
      native: media.title?.native || '',
      userPreferred: media.title?.userPreferred || media.title?.english || media.title?.romaji || '',
    },
    trailer: media.trailer
      ? {
          id: media.trailer.id || '',
          site: media.trailer.site || '',
          thumbnail: media.trailer.thumbnail || '',
          thumbnailHash: '',
        }
      : { id: '', site: '', thumbnail: '', thumbnailHash: '' },
    synonyms: media.synonyms || [],
    isLicensed: media.isLicensed ?? true,
    isAdult: media.isAdult ?? false,
    countryOfOrigin: media.countryOfOrigin || 'JP',
    image: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || '',
    imageHash: '',
    cover: media.bannerImage || media.coverImage?.extraLarge || media.coverImage?.large || '',
    coverHash: '',
    description: media.description || 'No description available.',
    status: formatStatus(media.status),
    releaseDate: media.startDate?.year || (media.seasonYear ?? 0),
    totalEpisodes: totalEps,
    currentEpisode: media.nextAiringEpisode ? media.nextAiringEpisode.episode - 1 : totalEps,
    rating: media.averageScore ? media.averageScore / 10 : 0,
    duration: media.duration || 24,
    genres: media.genres || [],
    studios: (media.studios?.nodes || []).map((s: any) => s.name),
    subOrDub: 'sub',
    season: media.season || '',
    popularity: media.popularity || 0,
    type: media.format || 'TV',
    startDate: {
      year: media.startDate?.year || 0,
      month: media.startDate?.month || 0,
      day: media.startDate?.day || 0,
    },
    endDate: {
      year: media.endDate?.year || 0,
      month: media.endDate?.month || 0,
      day: media.endDate?.day || 0,
    },
    recommendations,
    characters,
    relations,
    mappings: [],
    artwork: [
      { img: media.bannerImage || '', type: 'banner', providerId: 'anilist' },
      { img: media.coverImage?.extraLarge || '', type: 'cover', providerId: 'anilist' },
      { img: media.coverImage?.large || '', type: 'poster', providerId: 'anilist' },
      { img: media.coverImage?.large || '', type: 'clear_logo', providerId: 'anilist' },
    ],
    episodes: (media.airingSchedule?.nodes || []).map((airing: any) => ({
      id: `${media.id || 'anime'}-episode-${airing.episode}`,
      title: `Episode ${airing.episode}`,
      description: null,
      number: airing.episode,
      image: '',
      imageHash: '',
      airDate: airing.airingAt ? new Date(airing.airingAt * 1000).toISOString() : null,
      airingAt: airing.airingAt,
      isReleased: !airing.airingAt || airing.airingAt * 1000 <= Date.now(),
    })),
    color: media.coverImage?.color || '#8080cf',
    nextAiringEpisode: media.nextAiringEpisode
      ? {
          episode: media.nextAiringEpisode.episode,
          airingAt: media.nextAiringEpisode.airingAt,
          timeUntilAiring: media.nextAiringEpisode.timeUntilAiring,
        }
      : null,
  };
}

const FRANCHISE_RELATION_TYPES = new Set(['PREQUEL', 'SEQUEL']);

function relationFromMedia(media: any, relationType: string): Relation {
  return {
    id: media.id?.toString() || '',
    malId: media.idMal?.toString() || '',
    relationType,
    title: {
      romaji: media.title?.romaji || '',
      english: media.title?.english || media.title?.romaji || '',
      native: media.title?.native || '',
      userPreferred: media.title?.userPreferred || media.title?.romaji || '',
    },
    status: formatStatus(media.status),
    episodes: media.episodes || 0,
    image: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || '',
    imageHash: '',
    cover: media.bannerImage || media.coverImage?.extraLarge || '',
    coverHash: '',
    rating: media.averageScore ? media.averageScore / 10 : 0,
    type: media.format || media.type || 'TV',
    releaseDate: media.startDate?.year || media.seasonYear || 0,
    season: media.season || '',
    seasonYear: media.seasonYear || 0,
  };
}

/** Load a bounded, deduplicated prequel/sequel chain for the Seasons panel. */
export async function queryAniListFranchiseSeasons(root: Anime): Promise<Relation[]> {
  const rootRelation = relationFromMedia(root, 'CURRENT');
  const relations = new Map<string, Relation>([[rootRelation.id, rootRelation]]);
  let frontier = root.relations
    .filter((relation) => FRANCHISE_RELATION_TYPES.has(relation.relationType.toUpperCase()))
    .map((relation) => ({ id: relation.id, relationType: relation.relationType.toUpperCase() }))
    .filter((relation) => Boolean(relation.id));

  for (let depth = 0; depth < 5 && frontier.length > 0 && relations.size < 24; depth += 1) {
    const uniqueFrontier = new Map(frontier.map((relation) => [relation.id, relation.relationType]));
    const ids = [...uniqueFrontier.keys()].slice(0, 24 - relations.size);
    const query = `
      query ($ids: [Int]) {
        Page(page: 1, perPage: 24) {
          media(id_in: $ids, type: ANIME) {
            id
            idMal
            title { romaji english native userPreferred }
            coverImage { extraLarge large medium }
            bannerImage
            format
            type
            status
            episodes
            averageScore
            season
            seasonYear
            startDate { year month day }
            relations {
              edges {
                relationType(version: 2)
                node {
                  id
                  idMal
                  title { romaji english native userPreferred }
                  coverImage { extraLarge large medium }
                  bannerImage
                  format
                  type
                  status
                  episodes
                  averageScore
                  season
                  seasonYear
                  startDate { year month day }
                }
              }
            }
          }
        }
      }
    `;
    try {
      const data = await fetchAniListGraphQL<{ Page?: { media?: any[] } }>(query, {
        ids: ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
      });
      const nextFrontier: Array<{ id: string; relationType: string }> = [];
      for (const media of data.Page?.media || []) {
        const known = relations.get(media.id?.toString());
        const mediaType = String(media.format || media.type || '').toUpperCase();
        if (!known && media.id && ['TV', 'ONA'].includes(mediaType)) {
          relations.set(media.id.toString(), relationFromMedia(media, uniqueFrontier.get(media.id.toString()) || 'SEQUEL'));
        }
        for (const edge of media.relations?.edges || []) {
          if (!FRANCHISE_RELATION_TYPES.has(String(edge.relationType || '').toUpperCase())) continue;
          const node = edge.node;
          if (!node?.id) continue;
          const id = node.id.toString();
          if (!relations.has(id) && ['TV', 'ONA'].includes(String(node.format || node.type || '').toUpperCase())) {
            relations.set(id, relationFromMedia(node, edge.relationType));
            nextFrontier.push({ id, relationType: String(edge.relationType).toUpperCase() });
          }
        }
      }
      frontier = nextFrontier;
    } catch (error) {
      console.warn('[AniList] Failed to expand franchise seasons:', error);
      break;
    }
  }

  return [...relations.values()]
    .filter((relation) => ['CURRENT', 'TV', 'ONA'].includes(relation.relationType) || ['TV', 'ONA'].includes(relation.type.toUpperCase()))
    .sort((a, b) => {
      const dateDifference = (a.releaseDate || 0) - (b.releaseDate || 0);
      if (dateDifference !== 0) return dateDifference;
      const seasonDifference = (a.seasonYear || 0) - (b.seasonYear || 0);
      if (seasonDifference !== 0) return seasonDifference;
      return (a.title.english || a.title.romaji).localeCompare(b.title.english || b.title.romaji);
    });
}

export function transformAniListPageToPaging(pageData: any): Paging {
  const pageInfo = pageData?.pageInfo || {};
  const mediaList = pageData?.media || pageData?.results || [];

  return {
    currentPage: pageInfo.currentPage || 1,
    hasNextPage: pageInfo.hasNextPage || false,
    totalPages: pageInfo.lastPage || 1,
    totalResults: pageInfo.total || mediaList.length,
    results: mediaList.map(transformAniListMediaToAnime),
  };
}

// Media list queries
const MEDIA_PAGE_FRAGMENT = `
  pageInfo {
    total
    perPage
    currentPage
    lastPage
    hasNextPage
  }
  media(type: ANIME, sort: $sort, isAdult: false) {
    id
    idMal
    title {
      romaji
      english
      native
      userPreferred
    }
    coverImage {
      extraLarge
      large
      medium
      color
    }
    bannerImage
    description
    format
    status
    episodes
    duration
    averageScore
    popularity
    genres
    season
    seasonYear
    startDate {
      year
      month
      day
    }
    nextAiringEpisode {
      episode
      airingAt
      timeUntilAiring
    }
  }
`;

export async function queryAniListTrending(page: number = 1, perPage: number = 20): Promise<Paging> {
  const query = `
    query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        ${MEDIA_PAGE_FRAGMENT}
      }
    }
  `;
  const data = await fetchAniListGraphQL(query, {
    page,
    perPage,
    sort: ['TRENDING_DESC', 'POPULARITY_DESC'],
  });
  return transformAniListPageToPaging(data.Page);
}

export async function queryAniListPopular(page: number = 1, perPage: number = 20): Promise<Paging> {
  const query = `
    query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        ${MEDIA_PAGE_FRAGMENT}
      }
    }
  `;
  const data = await fetchAniListGraphQL(query, {
    page,
    perPage,
    sort: ['POPULARITY_DESC'],
  });
  return transformAniListPageToPaging(data.Page);
}

export async function queryAniListTopRated(page: number = 1, perPage: number = 20): Promise<Paging> {
  const query = `
    query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        ${MEDIA_PAGE_FRAGMENT}
      }
    }
  `;
  const data = await fetchAniListGraphQL(query, {
    page,
    perPage,
    sort: ['SCORE_DESC'],
  });
  return transformAniListPageToPaging(data.Page);
}

export async function queryAniListTopAiring(page: number = 1, perPage: number = 20): Promise<Paging> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          hasNextPage
          currentPage
          lastPage
        }
        media(type: ANIME, status: RELEASING, sort: [POPULARITY_DESC], isAdult: false) {
          id
          idMal
          title {
            romaji
            english
            native
            userPreferred
          }
          coverImage {
            extraLarge
            large
            medium
            color
          }
          bannerImage
          description
          format
          status
          episodes
          duration
          averageScore
          popularity
          genres
          season
          seasonYear
          nextAiringEpisode {
            episode
            airingAt
            timeUntilAiring
          }
        }
      }
    }
  `;
  const data = await fetchAniListGraphQL(query, { page, perPage });
  return transformAniListPageToPaging(data.Page);
}

export async function queryAniListUpcoming(
  page: number = 1,
  perPage: number = 20,
  season?: string,
  year?: number,
): Promise<Paging> {
  const query = `
    query ($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          hasNextPage
          currentPage
          lastPage
        }
        media(type: ANIME, status: NOT_YET_RELEASED, season: $season, seasonYear: $seasonYear, sort: [POPULARITY_DESC], isAdult: false) {
          id
          idMal
          title {
            romaji
            english
            native
            userPreferred
          }
          coverImage {
            extraLarge
            large
            medium
            color
          }
          bannerImage
          description
          format
          status
          episodes
          duration
          averageScore
          popularity
          genres
          season
          seasonYear
          startDate {
            year
            month
            day
          }
        }
      }
    }
  `;
  const data = await fetchAniListGraphQL(query, {
    page,
    perPage,
    ...(season && { season: season.toUpperCase() }),
    ...(year && { seasonYear: year }),
  });
  return transformAniListPageToPaging(data.Page);
}

export async function queryAniListSearch(
  searchQuery: string = '',
  page: number = 1,
  perPage: number = 20,
  options: {
    genres?: string[];
    season?: string;
    format?: string;
    sort?: string[];
    year?: string;
    status?: string;
    id?: string;
  } = {},
): Promise<Paging> {
  const query = `
    query (
      $page: Int,
      $perPage: Int,
      $search: String,
      $genre_in: [String],
      $season: MediaSeason,
      $seasonYear: Int,
      $format: MediaFormat,
      $status: MediaStatus,
      $sort: [MediaSort]
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          hasNextPage
          currentPage
          lastPage
        }
        media(
          type: ANIME,
          search: $search,
          genre_in: $genre_in,
          season: $season,
          seasonYear: $seasonYear,
          format: $format,
          status: $status,
          sort: $sort,
          isAdult: false
        ) {
          id
          idMal
          title {
            romaji
            english
            native
            userPreferred
          }
          coverImage {
            extraLarge
            large
            medium
            color
          }
          bannerImage
          description
          format
          status
          episodes
          duration
          averageScore
          popularity
          genres
          season
          seasonYear
          startDate {
            year
            month
            day
          }
          nextAiringEpisode {
            episode
            airingAt
            timeUntilAiring
          }
        }
      }
    }
  `;

  // Parse sort
  let mappedSort = ['POPULARITY_DESC'];
  if (options.sort && options.sort.length > 0) {
    mappedSort = options.sort.map((s) => {
      // Remove brackets if stringified
      const clean = s.replace(/[\[\]"']/g, '');
      if (clean === 'SCORE_DESC') return 'SCORE_DESC';
      if (clean === 'POPULARITY_DESC') return 'POPULARITY_DESC';
      if (clean === 'TRENDING_DESC') return 'TRENDING_DESC';
      if (clean === 'START_DATE_DESC') return 'START_DATE_DESC';
      if (clean === 'TITLE_ROMAJI') return 'TITLE_ROMAJI';
      return clean || 'POPULARITY_DESC';
    });
  }

  const variables: Record<string, any> = {
    page,
    perPage,
    sort: mappedSort,
  };

  if (searchQuery && searchQuery.trim()) {
    variables.search = searchQuery.trim();
  }
  if (options.genres && options.genres.length > 0) {
    variables.genre_in = options.genres;
  }
  if (options.season) {
    variables.season = options.season.toUpperCase();
  }
  if (options.year) {
    const parsedYear = parseInt(options.year, 10);
    if (!isNaN(parsedYear)) variables.seasonYear = parsedYear;
  }
  if (options.format) {
    variables.format = options.format.toUpperCase();
  }
  if (options.status) {
    let stat = options.status.toUpperCase();
    if (stat === 'RELEASING' || stat === 'ONGOING') stat = 'RELEASING';
    if (stat === 'FINISHED' || stat === 'COMPLETED') stat = 'FINISHED';
    if (stat === 'NOT_YET_RELEASED') stat = 'NOT_YET_RELEASED';
    if (stat === 'CANCELLED') stat = 'CANCELLED';
    variables.status = stat;
  }

  const data = await fetchAniListGraphQL(query, variables);
  return transformAniListPageToPaging(data.Page);
}

export async function queryAniListAnimeDetails(animeId: string | number): Promise<Anime> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
          userPreferred
        }
        coverImage {
          extraLarge
          large
          medium
          color
        }
        bannerImage
        description(asHtml: false)
        format
        status
        episodes
        duration
        averageScore
        popularity
        genres
        synonyms
        isLicensed
        isAdult
        countryOfOrigin
        season
        seasonYear
        startDate {
          year
          month
          day
        }
        endDate {
          year
          month
          day
        }
        trailer {
          id
          site
          thumbnail
        }
        nextAiringEpisode {
          episode
          airingAt
          timeUntilAiring
        }
        airingSchedule(perPage: 100) {
          nodes {
            episode
            airingAt
          }
        }
        studios(isMain: true) {
          nodes {
            id
            name
          }
        }
        relations {
          edges {
            relationType(version: 2)
            node {
              id
              idMal
              title {
                romaji
                english
                native
                userPreferred
              }
              coverImage {
                extraLarge
                large
                medium
              }
              bannerImage
              format
              type
              status
              episodes
              averageScore
              season
              seasonYear
              startDate {
                year
                month
                day
              }
            }
          }
        }
        recommendations(sort: RATING_DESC, perPage: 12) {
          nodes {
            mediaRecommendation {
              id
              idMal
              title {
                romaji
                english
                native
                userPreferred
              }
              coverImage {
                large
                medium
              }
              bannerImage
              format
              episodes
              status
              averageScore
            }
          }
        }
        characters(sort: [ROLE, RELEVANCE], perPage: 12) {
          edges {
            role
            node {
              id
              name {
                full
                native
                userPreferred
              }
              image {
                large
                medium
              }
            }
            voiceActors(language: JAPANESE) {
              id
              name {
                full
                native
                userPreferred
              }
              image {
                large
                medium
              }
              languageV2
            }
          }
        }
      }
    }
  `;

  const parsedId = parseInt(animeId.toString(), 10);
  if (isNaN(parsedId)) {
    throw new Error(`Invalid anime ID: ${animeId}`);
  }

  const data = await fetchAniListGraphQL(query, { id: parsedId });
  if (!data?.Media) {
    throw new Error(`Anime with ID ${animeId} not found`);
  }
  return transformAniListMediaToAnime(data.Media);
}

// Two-way sync mutations
export async function updateAniListProgress(
  mediaId: number,
  progress: number,
  status?: string,
): Promise<any> {
  const token = safeLocalStorageGet('accessToken', '');
  if (!token) return null;

  const mutation = `
    mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
      SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
        id
        mediaId
        status
        progress
        score
      }
    }
  `;

  try {
    const vars: Record<string, any> = { mediaId, progress };
    if (status) vars.status = status;
    const data = await fetchAniListGraphQL(mutation, vars, token);
    return data?.SaveMediaListEntry;
  } catch (err) {
    console.warn('[AniListSync] Failed to update progress:', err);
    return null;
  }
}

export interface AniListMediaListEntry {
  id: number;
  mediaId: number;
  status: string;
  progress: number;
  score: number;
}

const progressSyncInFlight = new Map<number, Promise<any>>();
type AniListViewer = { id: number };
let viewerCache: { token: string; id: number } | null = null;
let viewerRequest: { token: string; promise: Promise<number | null> } | null = null;
const mediaListLookupInFlight = new Map<string, Promise<AniListMediaListEntry | null | undefined>>();

/** Resolve the viewer explicitly so MediaList lookups cannot return another user's entry. */
async function resolveAniListViewerId(token: string): Promise<number | null> {
  if (viewerCache?.token === token) return viewerCache.id;
  if (viewerRequest?.token === token) return viewerRequest.promise;

  const promise = fetchAniListGraphQL<{ Viewer: AniListViewer | null }>(
    'query { Viewer { id } }',
    {},
    token,
  )
    .then((data) => {
      const id = Number(data?.Viewer?.id);
      if (!Number.isInteger(id) || id <= 0) return null;
      viewerCache = { token, id };
      return id;
    })
    .catch((error) => {
      console.warn('[AniListSync] Failed to resolve authenticated viewer:', error);
      return null;
    });

  viewerRequest = { token, promise };
  try {
    return await promise;
  } finally {
    if (viewerRequest?.promise === promise) viewerRequest = null;
  }
}

export function clearAniListViewerCache(): void {
  viewerCache = null;
  viewerRequest = null;
}

/** Load the authenticated user's entry without loading their entire library. */
export async function fetchAniListMediaListEntry(
  mediaId: number,
  userId?: number,
): Promise<AniListMediaListEntry | null | undefined> {
  const token = safeLocalStorageGet('accessToken', '');
  if (!token) return null;

  const resolvedUserId = Number.isInteger(userId) && (userId || 0) > 0
    ? userId
    : await resolveAniListViewerId(token);
  if (!resolvedUserId) return undefined;

  const lookupKey = `${token}:${resolvedUserId}:${mediaId}`;
  const pendingLookup = mediaListLookupInFlight.get(lookupKey);
  if (pendingLookup) return pendingLookup;

  const request = (async () => {
    const query = `
      query ($mediaId: Int, $userId: Int) {
        MediaList(mediaId: $mediaId, userId: $userId) {
          id
          mediaId
          status
          progress
          score
        }
      }
    `;

    try {
      const data = await fetchAniListGraphQL<{ MediaList: AniListMediaListEntry | null }>(
        query,
        { mediaId, userId: resolvedUserId },
        token,
      );
      return data?.MediaList || null;
    } catch (err) {
      // AniList commonly answers a scoped MediaList lookup with 404 when the
      // authenticated user has no entry yet. That is the normal first-watch
      // case, not a resolver failure: syncAniListProgress must continue to
      // SaveMediaListEntry so AniList creates the entry at the episode reached.
      const status = Number((err as { status?: number })?.status);
      if (status === 404) return null;
      // A failed lookup should not prevent SaveMediaListEntry from creating an
      // entry when the viewer starts a title for the first time.
      console.warn('[AniListSync] Failed to load media list entry:', err);
      return undefined;
    }
  })();
  mediaListLookupInFlight.set(lookupKey, request);
  try {
    return await request;
  } finally {
    if (mediaListLookupInFlight.get(lookupKey) === request) {
      mediaListLookupInFlight.delete(lookupKey);
    }
  }
}

/**
 * Advance AniList progress without ever moving it backwards or deleting an
 * entry. If the title is not in the user's list yet, AniList creates it.
 */
export async function syncAniListProgress(
  mediaId: number,
  progress: number,
  totalEpisodes?: number,
  userId?: number,
): Promise<any> {
  const existingRequest = progressSyncInFlight.get(mediaId);
  if (existingRequest) return existingRequest;

  const token = safeLocalStorageGet('accessToken', '');
  if (!token) return null;

  const request = (async () => {
    const requestedProgress = Math.max(0, Math.floor(progress));
    const existing = await fetchAniListMediaListEntry(mediaId, userId);
    if (existing === undefined) return null;
    const boundedProgress = totalEpisodes && totalEpisodes > 0
      ? Math.min(requestedProgress, Math.floor(totalEpisodes))
      : requestedProgress;
    const nextProgress = Math.max(boundedProgress, existing?.progress || 0);
    if (existing && nextProgress === existing.progress) return existing;

    const shouldComplete = Boolean(totalEpisodes && nextProgress >= totalEpisodes);
    const nextStatus = shouldComplete
      ? 'COMPLETED'
      : !existing || existing.status === 'PLANNING'
        ? 'CURRENT'
        : undefined;
    return updateAniListProgress(mediaId, nextProgress, nextStatus);
  })();
  progressSyncInFlight.set(mediaId, request);
  try {
    return await request;
  } finally {
    progressSyncInFlight.delete(mediaId);
  }
}

export async function updateAniListStatus(
  mediaId: number,
  status: string,
  scoreRaw?: number,
  progress?: number,
): Promise<any> {
  const token = safeLocalStorageGet('accessToken', '');
  if (!token) return null;

  const mutation = `
    mutation ($mediaId: Int, $status: MediaListStatus, $scoreRaw: Int, $progress: Int) {
      SaveMediaListEntry(mediaId: $mediaId, status: $status, scoreRaw: $scoreRaw, progress: $progress) {
        id
        mediaId
        status
        progress
        score
      }
    }
  `;

  try {
    const vars: Record<string, any> = { mediaId, status };
    if (scoreRaw !== undefined) {
      const safeScore = Math.min(100, Math.max(1, Math.round(scoreRaw)));
      if (safeScore > 0) vars.scoreRaw = safeScore;
    }
    if (progress !== undefined) vars.progress = progress;
    const data = await fetchAniListGraphQL(mutation, vars, token);
    return data?.SaveMediaListEntry;
  } catch (err) {
    console.warn('[AniListSync] Failed to update media status:', err);
    return null;
  }
}
