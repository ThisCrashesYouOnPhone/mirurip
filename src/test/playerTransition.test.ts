import { describe, expect, it } from 'vitest';
import { consumePrefetchedStream } from '../client/playerTransition';

describe('player source transitions', () => {
  it('consumes only the prefetched response for the requested episode', () => {
    const prefetched = { key: 'episode-2|anikoto|ssub', episodeId: 'episode-2', response: { id: 2 } };
    const consumed = consumePrefetchedStream(prefetched, 'episode-2|anikoto|ssub');
    expect(consumed.response).toEqual({ id: 2 });
    expect(consumed.remaining).toBeNull();
  });

  it('does not consume a response for a different source or episode', () => {
    const prefetched = { key: 'episode-2|anikoto|ssub', episodeId: 'episode-2', response: { id: 2 } };
    const result = consumePrefetchedStream(prefetched, 'episode-2|kaa|ssub');
    expect(result.response).toBeNull();
    expect(result.remaining).toBe(prefetched);
  });
});
