export type PrefetchedStream<T> = {
  key: string;
  episodeId: string;
  response: T;
};

/** Consume a prefetched response only when it belongs to the requested source. */
export function consumePrefetchedStream<T>(
  prefetched: PrefetchedStream<T> | null,
  requestedKey: string,
): { response: T | null; remaining: PrefetchedStream<T> | null } {
  if (!prefetched || prefetched.key !== requestedKey) {
    return { response: null, remaining: prefetched };
  }
  return { response: prefetched.response, remaining: null };
}
