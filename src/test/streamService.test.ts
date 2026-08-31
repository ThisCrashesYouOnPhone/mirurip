import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateEpisodesList,
  fetchAnimeEpisodeList,
  fetchEpisodeStreamingSources,
  fetchEpisodeSkipTimes,
} from '../client/streamService';

describe('Multi-Provider Streaming Engine & Ad-Free Resolvers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should reliably generate an episode list when given total episode count', () => {
    const episodes = generateEpisodesList('21', 'One Piece', 3);

    expect(episodes.length).toBe(3);
    expect(episodes[0]).toEqual({
      id: 'one-piece-episode-1',
      title: 'Episode 1',
      number: 1,
      description: 'Episode 1 of One Piece',
      image: '',
      imageHash: '',
      airDate: null,
    });
    expect(episodes[2].number).toBe(3);
    expect(episodes[2].id).toBe('one-piece-episode-3');
  });

  it('should fallback to generated episode list when backend is unreachable', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const episodes = await fetchAnimeEpisodeList('100', 'Naruto', 5);

    expect(episodes.length).toBe(5);
    expect(episodes[0].id).toBe('naruto-episode-1');
  });

  it('should fetch streaming sources from secondary proxy extractor if primary fails', async () => {
    const mockProxyData = {
      headers: { Referer: 'https://gogoanime3.co/' },
      sources: [
        { url: 'https://cdn.example.com/hls/1080p.m3u8', quality: '1080p', isM3U8: true },
        { url: 'https://cdn.example.com/hls/720p.m3u8', quality: '720p', isM3U8: true },
        { url: 'https://cdn.example.com/hls/auto.m3u8', quality: 'auto', isM3U8: true },
      ],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockProxyData,
    } as any);

    const streamData = await fetchEpisodeStreamingSources('one-piece-episode-1');

    expect(streamData.sources.length).toBe(3);
    expect(streamData.sources[0].quality).toBe('1080p');
    expect(streamData.sources[0].url).toContain('.m3u8');
  });

  it('should gracefully return empty sources if all online stream extractors fail', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('All offline'));

    const streamData = await fetchEpisodeStreamingSources('offline-episode-1');

    expect(streamData.sources).toBeDefined();
    expect(streamData.sources.length).toBe(0);
  });

  it('should preserve an upstream unavailable language error without falling back to subtitles', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        unavailable: {
          code: 'LANGUAGE_UNAVAILABLE',
          message: 'This dub/sub version is not available yet.',
          retryable: false,
        },
      }),
      clone() { return this; },
    } as any);

    const streamData = await fetchEpisodeStreamingSources(
      're-zero-episode-13',
      'anikoto',
      'Re:Zero',
      true,
      '123',
      'dub',
    );

    expect(streamData.sources).toEqual([]);
    expect(streamData.unavailable).toMatchObject({
      code: 'LANGUAGE_UNAVAILABLE',
      retryable: false,
      mode: 'dub',
      episode: 13,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should query AniSkip for OP and ED skip time intervals', async () => {
    const mockAniSkipResponse = {
      found: true,
      results: [
        {
          interval: { startTime: 85.5, endTime: 175.2 },
          skipType: 'op',
          episodeLength: 1420,
        },
        {
          interval: { startTime: 1300.0, endTime: 1390.0 },
          skipType: 'ed',
          episodeLength: 1420,
        },
      ],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockAniSkipResponse,
    } as any);

    const skipTimes = await fetchEpisodeSkipTimes('21', 1, 1420);

    expect(skipTimes.found).toBe(true);
    expect(skipTimes.results.length).toBe(2);
    expect(skipTimes.results[0].skipType).toBe('op');
    expect(skipTimes.results[0].interval.startTime).toBe(85.5);
  });

  it('should gracefully return empty results if AniSkip is missing malId or episode', async () => {
    const skipTimes = await fetchEpisodeSkipTimes('', 0);
    expect(skipTimes.found).toBe(false);
    expect(skipTimes.results).toEqual([]);
  });
});
