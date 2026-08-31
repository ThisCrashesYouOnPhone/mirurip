import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAniKotoApi } from '../../functions/api/anikotoApi';

describe('structured AniKoto API adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('matches by AniList ID and preserves dub, subtitles, and skip intervals', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [
          { title: 'One Piece', slug: 'one-piece', aniListId: 21 },
          { title: 'One Piece Film', slug: 'one-piece-film', aniListId: 999 },
        ] }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {
          episodeTitle: 'Episode 1',
          intro: { start: 30, end: 120 },
          outro: { start: 1400, end: 1490 },
          servers: [{
            type: 'dub',
            serverName: 'Bael',
            m3u8Url: 'https://cdn.example.test/episode.m3u8',
            embedUrl: 'https://player.example.test/',
            subtitles: [{ file: 'https://cdn.example.test/english.vtt', label: 'English', language: 'en' }],
          }],
        } }),
      } as any);

    const result = await resolveAniKotoApi(
      'One Piece',
      1,
      'dub',
      new URL('https://miruro.example/'),
      {},
      '21',
    );
    const payload = await result.json() as any;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(payload.sources).toHaveLength(1);
    expect(payload.isDub).toBe(true);
    expect(payload.subtitles[0].name).toBe('English');
    expect(payload.skipTimes).toEqual([
      { interval: { startTime: 30, endTime: 120 }, skipType: 'op' },
      { interval: { startTime: 1400, endTime: 1490 }, skipType: 'ed' },
    ]);
  });
});
