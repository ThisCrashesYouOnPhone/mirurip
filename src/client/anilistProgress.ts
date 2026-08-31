import { safeLocalStorageGet, safeLocalStorageGetJson, safeLocalStorageSet } from './safeStorage';
import { syncAniListProgress } from './anilistSync';

type PendingProgress = {
  mediaId: number;
  progress: number;
  totalEpisodes?: number;
  attempts: number;
};

const STORAGE_KEY = 'anilist-progress-queue-v1';
const inFlight = new Map<number, Promise<boolean>>();
const retryTimers = new Map<number, ReturnType<typeof setTimeout>>();

function readQueue(): Record<string, PendingProgress> {
  return safeLocalStorageGetJson<Record<string, PendingProgress>>(STORAGE_KEY, {});
}

function writeQueue(queue: Record<string, PendingProgress>): void {
  safeLocalStorageSet(STORAGE_KEY, JSON.stringify(queue));
}

async function flush(mediaId: number, userId?: number): Promise<boolean> {
  const existing = inFlight.get(mediaId);
  if (existing) return existing;

  // Defer execution by one microtask so the promise is registered in
  // `inFlight` before the no-token fast path can complete.
  const request = Promise.resolve().then(async () => {
    const queue = readQueue();
    const pending = queue[String(mediaId)];
    try {
      // Keep queued progress when auth is still being restored. The authUpdate
      // listener in the player will flush it after login/token recovery.
      if (!pending || !safeLocalStorageGet('accessToken', '')) return false;
      const result = await syncAniListProgress(mediaId, pending.progress, pending.totalEpisodes, userId);
      if (!result) {
        if (pending.attempts < 3) {
          queue[String(mediaId)] = { ...pending, attempts: pending.attempts + 1 };
          writeQueue(queue);
          scheduleRetry(mediaId, 2000 * 2 ** pending.attempts);
        }
        return false;
      }
      // A newer episode may have been queued while this request was in
      // flight. Only remove the progress that this request actually sent.
      const latestQueue = readQueue();
      const latest = latestQueue[String(mediaId)];
      if (!latest || latest.progress <= pending.progress) {
        delete latestQueue[String(mediaId)];
      }
      // Never write the snapshot captured before the request if a newer
      // episode was queued while AniList was responding.
      writeQueue(latestQueue);
      if (typeof window !== 'undefined') {
        // Send the confirmed mutation result to the banner. Consumers should
        // not perform another MediaList lookup immediately after a save: that
        // wastes one of AniList's rate-limited requests and can race the write.
        window.dispatchEvent(new CustomEvent('aniListSync', {
          detail: {
            mediaId,
            progress: result?.progress ?? pending.progress,
            entry: result,
          },
        }));
      }
      return true;
    } finally {
      inFlight.delete(mediaId);
      const latest = readQueue()[String(mediaId)];
      if (pending && latest && latest.progress > pending.progress) {
        queueMicrotask(() => { void flush(mediaId); });
      }
    }
  });
  inFlight.set(mediaId, request);
  return request;
}

function scheduleRetry(mediaId: number, delay: number): void {
  const existing = retryTimers.get(mediaId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    retryTimers.delete(mediaId);
    void flush(mediaId);
  }, delay);
  retryTimers.set(mediaId, timer);
}

/** Queue eligible progress and flush it without blocking episode playback. */
export function recordAniListProgress(
  mediaId: number,
  progress: number,
  totalEpisodes?: number,
  userId?: number,
): Promise<boolean> {
  if (!Number.isFinite(mediaId) || mediaId <= 0 || progress <= 0) {
    return Promise.resolve(false);
  }
  const queue = readQueue();
  const key = String(mediaId);
  const previous = queue[key];
  const nextProgress = Math.max(previous?.progress || 0, Math.floor(progress));
  queue[key] = {
    mediaId,
    progress: nextProgress,
    totalEpisodes: totalEpisodes || previous?.totalEpisodes,
    // A newer progress value deserves a fresh retry budget.
    attempts: previous && nextProgress === previous.progress ? previous.attempts : 0,
  };
  writeQueue(queue);
  return flush(mediaId, userId);
}

export async function flushQueuedAniListProgress(): Promise<void> {
  await Promise.all(Object.keys(readQueue()).map((key) => flush(Number(key))));
}

export function clearAniListProgressQueue(): void {
  for (const timer of retryTimers.values()) clearTimeout(timer);
  retryTimers.clear();
  writeQueue({});
}
