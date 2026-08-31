import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  transformAniListMediaToAnime,
  transformAniListPageToPaging,
  fetchAniListGraphQL,
  updateAniListProgress,
  updateAniListStatus,
  syncAniListProgress,
  queryAniListFranchiseSeasons,
  clearAniListViewerCache,
} from '../client/anilistSync';

describe('AniList Direct GraphQL Engine & Two-Way Sync', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAniListViewerCache();
    vi.restoreAllMocks();
  });

  it('should accurately transform raw AniList media payload to Miruro standard Anime interface', () => {
    const rawMedia = {
      id: 21,
      idMal: 21,
      title: {
        romaji: 'One Piece',
        english: 'One Piece',
        native: 'ワンピース',
        userPreferred: 'One Piece',
      },
      coverImage: {
        extraLarge: 'https://img.test/extra.jpg',
        large: 'https://img.test/large.jpg',
        medium: 'https://img.test/med.jpg',
        color: '#ff8800',
      },
      bannerImage: 'https://img.test/banner.jpg',
      description: 'Luffy searches for the One Piece.',
      format: 'TV',
      status: 'RELEASING',
      episodes: 1120,
      duration: 24,
      averageScore: 89,
      popularity: 500000,
      genres: ['Action', 'Adventure', 'Fantasy'],
      season: 'FALL',
      seasonYear: 1999,
      characters: {
        edges: [
          {
            role: 'MAIN',
            node: { id: 1, name: { full: 'Monkey D. Luffy', native: 'ルフィ' }, image: { large: 'https://img.test/luffy.jpg' } },
            voiceActors: [{ id: 10, languageV2: 'Japanese', name: { full: 'Mayumi Tanaka' }, image: { large: 'https://img.test/mayumi.jpg' } }],
          },
        ],
      },
      relations: {
        edges: [
          {
            relationType: 'SIDE_STORY',
            node: { id: 99, idMal: 99, title: { romaji: 'One Piece Movie' }, status: 'FINISHED', episodes: 1 },
          },
        ],
      },
      recommendations: {
        nodes: [
          {
            mediaRecommendation: { id: 269, idMal: 269, title: { english: 'Bleach' }, status: 'FINISHED', episodes: 366 },
          },
        ],
      },
    };

    const transformed = transformAniListMediaToAnime(rawMedia);

    expect(transformed.id).toBe('21');
    expect(transformed.malId).toBe('21');
    expect(transformed.title.english).toBe('One Piece');
    expect(transformed.status).toBe('Ongoing'); // RELEASING formatted to Ongoing
    expect(transformed.totalEpisodes).toBe(1120);
    expect(transformed.rating).toBe(8.9); // averageScore 89 -> 8.9 / 10
    expect(transformed.color).toBe('#ff8800');
    expect(transformed.characters.length).toBe(1);
    expect(transformed.characters[0].name.romaji).toBe('Monkey D. Luffy');
    expect(transformed.relations.length).toBe(1);
    expect(transformed.relations[0].relationType).toBe('SIDE_STORY');
    expect(transformed.recommendations.length).toBe(1);
    expect(transformed.recommendations[0].title.english).toBe('Bleach');
  });

  it('should transform AniList Page container to Paging interface', () => {
    const pageData = {
      pageInfo: {
        currentPage: 1,
        hasNextPage: true,
        lastPage: 50,
        total: 1000,
      },
      media: [
        {
          id: 16498,
          idMal: 16498,
          title: { english: 'Attack on Titan', romaji: 'Shingeki no Kyojin' },
          status: 'FINISHED',
          averageScore: 85,
        },
      ],
    };

    const paging = transformAniListPageToPaging(pageData);

    expect(paging.currentPage).toBe(1);
    expect(paging.hasNextPage).toBe(true);
    expect(paging.totalPages).toBe(50);
    expect(paging.totalResults).toBe(1000);
    expect(paging.results.length).toBe(1);
    expect(paging.results[0].title.english).toBe('Attack on Titan');
    expect(paging.results[0].status).toBe('Completed');
  });

  it('should execute fetchAniListGraphQL with authorization header when token exists', async () => {
    localStorage.setItem('accessToken', 'mock-token-abc');

    const mockResponse = {
      data: {
        Viewer: { id: 12345, name: 'AnimeFan' },
      },
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const result = await fetchAniListGraphQL('query { Viewer { id name } }');

    expect(result).toEqual(mockResponse.data);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://graphql.anilist.co',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-token-abc',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('should mutate AniList progress via SaveMediaListEntry when token is present', async () => {
    localStorage.setItem('accessToken', 'valid-user-token');

    const mockMutationResponse = {
      data: {
        SaveMediaListEntry: {
          id: 999,
          mediaId: 16498,
          status: 'CURRENT',
          progress: 5,
          score: 0,
        },
      },
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockMutationResponse,
    } as any);

    const entry = await updateAniListProgress(16498, 5, 'CURRENT');

    expect(entry).toEqual(mockMutationResponse.data.SaveMediaListEntry);
    expect(entry.progress).toBe(5);
    expect(entry.status).toBe('CURRENT');
  });

  it('should update media list status and score via updateAniListStatus', async () => {
    localStorage.setItem('accessToken', 'valid-user-token');

    const mockStatusResponse = {
      data: {
        SaveMediaListEntry: {
          id: 999,
          mediaId: 16498,
          status: 'COMPLETED',
          score: 90,
          progress: 24,
        },
      },
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockStatusResponse,
    } as any);

    const entry = await updateAniListStatus(16498, 'COMPLETED', 90, 24);

    expect(entry.status).toBe('COMPLETED');
    expect(entry.score).toBe(90);
    expect(entry.progress).toBe(24);
  });

  it('should return null if user is not authenticated when updating progress', async () => {
    const entry = await updateAniListProgress(16498, 5);
    expect(entry).toBeNull();
  });

  it('moves a planned title to current when playback advances it', async () => {
    localStorage.setItem('accessToken', 'valid-user-token');
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { Viewer: { id: 7785440 } } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { MediaList: { id: 3, mediaId: 16498, status: 'PLANNING', progress: 0, score: 0 } } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { SaveMediaListEntry: { id: 3, mediaId: 16498, status: 'CURRENT', progress: 1, score: 0 } } }),
      } as any);

    const entry = await syncAniListProgress(16498, 1, 12);
    expect(entry.status).toBe('CURRENT');
    const lookup = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
    expect(lookup.variables.userId).toBe(7785440);
    const mutation = JSON.parse(fetchSpy.mock.calls[2][1]?.body as string);
    expect(mutation.variables.status).toBe('CURRENT');
  });

  it('deduplicates and sorts linked TV seasons while preserving relation direction', async () => {
    const makeMedia = (id: number, title: string, year: number) => ({
      id,
      idMal: id,
      title: { english: title, romaji: title, userPreferred: title },
      coverImage: { large: `${id}.jpg` },
      format: 'TV',
      status: 'FINISHED',
      episodes: 12,
      averageScore: 80,
      season: 'SPRING',
      seasonYear: year,
      startDate: { year, month: 1, day: 1 },
      relations: { edges: [] },
    });
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { Page: { media: [makeMedia(3, 'Later', 2024), makeMedia(2, 'Earlier', 2022)] } } }),
    } as any);

    const root = {
      id: '1',
      title: { english: 'Current', romaji: 'Current', userPreferred: 'Current' },
      seasonYear: 2023,
      startDate: { year: 2023, month: 1, day: 1 },
      format: 'TV',
      relations: [
        { id: '2', relationType: 'PREQUEL' },
        { id: '2', relationType: 'PREQUEL' },
        { id: '3', relationType: 'SEQUEL' },
      ],
    } as any;

    const seasons = await queryAniListFranchiseSeasons(root);

    expect(seasons.map((season) => season.id)).toEqual(['2', '1', '3']);
    expect(seasons.find((season) => season.id === '2')?.relationType).toBe('PREQUEL');
  });
});
