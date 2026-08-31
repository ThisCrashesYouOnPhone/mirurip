import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchAdvancedSearch,
  fetchAnimeData,
  fetchTrendingAnime,
  fetchPopularAnime,
  fetchTopAnime,
  fetchTopAiringAnime,
  fetchUpcomingSeasons,
  filterReleasedEpisodes,
} from '../hooks/useApi';
import * as anilistSync from '../client/anilistSync';

describe('useApi Hooks with Low-Memory Session Caching', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should fetch and cache trending anime results', async () => {
    const mockPaging = {
      currentPage: 1,
      hasNextPage: true,
      totalPages: 10,
      totalResults: 200,
      results: [
        { id: '1', title: { english: 'Chainsaw Man', romaji: 'Chainsaw Man' }, status: 'Completed' } as any,
      ],
    };

    const spy = vi.spyOn(anilistSync, 'queryAniListTrending').mockResolvedValueOnce(mockPaging);

    const firstCall = await fetchTrendingAnime(1, 20);
    expect(firstCall.results[0].title.english).toBe('Chainsaw Man');
    expect(spy).toHaveBeenCalledTimes(1);

    // Second call should hit the memory/session cache without re-querying
    const secondCall = await fetchTrendingAnime(1, 20);
    expect(secondCall.results[0].title.english).toBe('Chainsaw Man');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should query advanced search with complex filters (genres, season, year, format, sort)', async () => {
    const mockSearchPaging = {
      currentPage: 1,
      hasNextPage: false,
      totalPages: 1,
      totalResults: 5,
      results: [{ id: '99', title: { english: 'Demon Slayer' } } as any],
    };

    const spy = vi.spyOn(anilistSync, 'queryAniListSearch').mockResolvedValueOnce(mockSearchPaging);

    const result = await fetchAdvancedSearch('Demon', 1, 20, {
      genres: ['Action', 'Demons'],
      season: 'SPRING',
      year: '2019',
      format: 'TV',
      sort: ['POPULARITY_DESC'],
      status: 'FINISHED',
    });

    expect(result.results[0].title.english).toBe('Demon Slayer');
    expect(spy).toHaveBeenCalledWith('Demon', 1, 20, {
      genres: ['Action', 'Demons'],
      season: 'SPRING',
      year: '2019',
      format: 'TV',
      sort: ['POPULARITY_DESC'],
      status: 'FINISHED',
    });
  });

  it('should fetch anime info by ID and cache it', async () => {
    const mockAnime = {
      id: '500',
      title: { english: 'Jujutsu Kaisen', romaji: 'Jujutsu Kaisen' },
      status: 'Ongoing',
      totalEpisodes: 24,
    } as any;

    const spy = vi.spyOn(anilistSync, 'queryAniListAnimeDetails').mockResolvedValueOnce(mockAnime);

    const data = await fetchAnimeData('500');
    expect(data.title.english).toBe('Jujutsu Kaisen');
    expect(spy).toHaveBeenCalledWith('500');

    // Subsequent fetch for same ID should be instant from cache
    const cachedData = await fetchAnimeData('500');
    expect(cachedData.title.english).toBe('Jujutsu Kaisen');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should query popular, top, airing, and upcoming seasons', async () => {
    const mockPaging = {
      currentPage: 1,
      hasNextPage: false,
      totalPages: 1,
      totalResults: 1,
      results: [{ id: '10', title: { english: 'Frieren' } } as any],
    };

    vi.spyOn(anilistSync, 'queryAniListPopular').mockResolvedValueOnce(mockPaging);
    vi.spyOn(anilistSync, 'queryAniListTopRated').mockResolvedValueOnce(mockPaging);
    vi.spyOn(anilistSync, 'queryAniListTopAiring').mockResolvedValueOnce(mockPaging);
    vi.spyOn(anilistSync, 'queryAniListUpcoming').mockResolvedValueOnce(mockPaging);

    const popular = await fetchPopularAnime(1, 10);
    const top = await fetchTopAnime(1, 10);
    const airing = await fetchTopAiringAnime(1, 10);
    const upcoming = await fetchUpcomingSeasons(1, 10, 'WINTER', 2025);

    expect(popular.results[0].title.english).toBe('Frieren');
    expect(top.results[0].title.english).toBe('Frieren');
    expect(airing.results[0].title.english).toBe('Frieren');
    expect(upcoming.results[0].title.english).toBe('Frieren');
  });

  it('hides future scheduled episodes while retaining the released AniList boundary', () => {
    const now = Date.parse('2026-08-31T00:00:00Z');
    const episodes = Array.from({ length: 19 }, (_, index) => ({
      id: `rezero-episode-${index + 1}`,
      title: `Episode ${index + 1}`,
      number: index + 1,
      description: null,
      image: '',
      imageHash: '',
      airDate: null,
    }));
    const details = {
      episodes: Array.from({ length: 19 }, (_, index) => ({
        ...episodes[index],
        airingAt: Math.floor((index < 14
          ? now - (14 - index) * 86400000
          : now + (index - 13) * 86400000) / 1000),
      })),
    } as any;

    const released = filterReleasedEpisodes(episodes, details, now);

    expect(released).toHaveLength(14);
    expect(released.at(-1)?.number).toBe(14);
  });
});
