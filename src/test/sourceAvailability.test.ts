import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAniKotoAvailability } from '../client/sourceAvailability';

describe('AniKoto availability cache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('caches successful visible-card requests', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ sub: 14, dub: 8, source: 'anikoto', fetchedAt: Date.now() }),
    } as any);

    const first = await fetchAniKotoAvailability('cache-test-1', 'Example Show');
    const second = await fetchAniKotoAvailability('cache-test-1', 'Example Show');

    expect(first).toMatchObject({ sub: 14, dub: 8, source: 'anikoto' });
    expect(second).toBe(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('omits badges when the endpoint cannot determine availability', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, json: async () => ({}) } as any);

    await expect(fetchAniKotoAvailability('failed-test-1', 'Missing Show')).resolves.toBeNull();
  });
});
