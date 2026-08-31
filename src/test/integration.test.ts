import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchAnimeData, fetchAnimeEpisodes, fetchAnimeStreamingLinks, fetchSkipTimes } from '../hooks/useApi';
import { updateAniListProgress } from '../client/anilistSync';

describe('End-to-End User Watch Flow & Integration Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('Flow 1: User navigates to anime -> fetches metadata -> resolves episodes -> loads stream links -> fetches AniSkip intervals', async () => {
    // 1. Mock AniList Anime Data Query
    const mockAnimeResponse = {
      data: {
        Media: {
          id: 113415,
          idMal: 40748,
          title: { english: 'Jujutsu Kaisen', romaji: 'Jujutsu Kaisen' },
          status: 'FINISHED',
          episodes: 24,
          coverImage: { large: 'https://img.test/jjk.jpg' },
          bannerImage: 'https://img.test/jjk-banner.jpg',
          averageScore: 86,
          genres: ['Action', 'Supernatural'],
        },
      },
    };

    // 2. Mock AniSkip skip times
    const mockSkipTimesResponse = {
      found: true,
      results: [
        { interval: { startTime: 90, endTime: 180 }, skipType: 'op' },
        { interval: { startTime: 1300, endTime: 1390 }, skipType: 'ed' },
      ],
    };

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('graphql.anilist.co')) {
        return { ok: true, json: async () => mockAnimeResponse } as any;
      }
      if (urlStr.includes('aniskip.com')) {
        return { ok: true, json: async () => mockSkipTimesResponse } as any;
      }
      return {
        ok: true,
        json: async () => ({
          sources: [{ url: 'https://stream.example.com/jjk-ep1.m3u8', quality: '1080p' }],
        }),
      } as any;
    });

    // Step A: Load Anime Details
    const anime = await fetchAnimeData('113415');
    expect(anime.title.english).toBe('Jujutsu Kaisen');
    expect(anime.totalEpisodes).toBe(24);

    // Step B: Load Episode List (generates reliable fallback list)
    const episodes = await fetchAnimeEpisodes('113415');
    expect(episodes.length).toBe(24);
    expect(episodes[0].number).toBe(1);

    // Step C: Load Stream Sources
    const streamSources = await fetchAnimeStreamingLinks(episodes[0].id);
    expect(streamSources.sources[0].url).toContain('.m3u8');

    // Step D: Load AniSkip Skip Times
    const skipTimes = await fetchSkipTimes({
      malId: anime.malId,
      episodeNumber: 1,
      episodeLength: 1440,
    });
    expect(skipTimes.found).toBe(true);
    expect(skipTimes.results[0].skipType).toBe('op');
  });

  it('Flow 2: 80% Playback progress syncs automatically with AniList account', async () => {
    localStorage.setItem('accessToken', 'mock-authenticated-session-token');

    let mutationSent = false;
    let sentMediaId = 0;
    let sentProgress = 0;

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (url.toString().includes('graphql.anilist.co')) {
        const body = JSON.parse(init.body);
        if (body.query.includes('SaveMediaListEntry')) {
          mutationSent = true;
          sentMediaId = body.variables.mediaId;
          sentProgress = body.variables.progress;
          return {
            ok: true,
            json: async () => ({
              data: {
                SaveMediaListEntry: {
                  id: 555,
                  mediaId: sentMediaId,
                  progress: sentProgress,
                  status: 'CURRENT',
                },
              },
            }),
          } as any;
        }
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    const result = await updateAniListProgress(113415, 12, 'CURRENT');

    expect(mutationSent).toBe(true);
    expect(sentMediaId).toBe(113415);
    expect(sentProgress).toBe(12);
    expect(result.progress).toBe(12);
  });
});
