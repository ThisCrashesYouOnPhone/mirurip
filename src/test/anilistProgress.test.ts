import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAniListProgressQueue,
  flushQueuedAniListProgress,
  recordAniListProgress,
} from '../client/anilistProgress';
import { clearAniListViewerCache } from '../client/anilistSync';

describe('AniList progress recorder', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAniListViewerCache();
    clearAniListProgressQueue();
    vi.restoreAllMocks();
  });

  it('creates an entry once at the threshold and keeps progress monotonic', async () => {
    localStorage.setItem('accessToken', 'test-token');
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { Viewer: { id: 7785440 } } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { MediaList: null } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {
          SaveMediaListEntry: { id: 1, mediaId: 100, status: 'CURRENT', progress: 8, score: 0 },
        } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {
          MediaList: { id: 1, mediaId: 100, status: 'CURRENT', progress: 8, score: 0 },
        } }),
      } as any);

    await expect(recordAniListProgress(100, 8, 12)).resolves.toBe(true);
    await expect(recordAniListProgress(100, 6, 12)).resolves.toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(localStorage.getItem('anilist-progress-queue-v1')).toBe('{}');
  });

  it('keeps progress queued until AniList authentication is available', async () => {
    await expect(recordAniListProgress(200, 3, 12)).resolves.toBe(false);
    expect(JSON.parse(localStorage.getItem('anilist-progress-queue-v1') || '{}')['200'].progress).toBe(3);

    localStorage.setItem('accessToken', 'test-token');
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { Viewer: { id: 7785440 } } }),
      } as any)
      .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { MediaList: { id: 2, mediaId: 200, progress: 3, status: 'CURRENT' } } }),
      } as any);
    await flushQueuedAniListProgress();
    expect(localStorage.getItem('anilist-progress-queue-v1')).toBe('{}');
  });

  it('treats a missing MediaList 404 as a new title and creates it at the watched episode', async () => {
    localStorage.setItem('accessToken', 'test-token');
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { Viewer: { id: 7785440 } } }),
      } as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '{"errors":[{"message":"Not Found."}],"data":{"MediaList":null}}',
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {
          SaveMediaListEntry: { id: 3, mediaId: 300, status: 'CURRENT', progress: 3, score: 0 },
        } }),
      } as any);

    await expect(recordAniListProgress(300, 3, 12)).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const mutation = JSON.parse(fetchSpy.mock.calls[2][1]?.body as string);
    expect(mutation.variables).toEqual({ mediaId: 300, progress: 3, status: 'CURRENT' });
    expect(localStorage.getItem('anilist-progress-queue-v1')).toBe('{}');
  });

});
