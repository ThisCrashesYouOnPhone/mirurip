export type MediaSessionOptions = {
  title: string;
  episodeTitle?: string;
  episodeNumber?: number | string;
  artwork?: string;
  onPlay: () => void;
  onPause: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
};

type MediaSessionLike = {
  metadata: unknown;
  setActionHandler: (action: string, handler: (() => void) | null) => void;
};

/**
 * Install OS/PiP media controls without making the player depend on the
 * Media Session API being present (older Safari versions do not expose it).
 * The returned cleanup only clears metadata owned by this player instance.
 */
export function setupMediaSession(options: MediaSessionOptions): () => void {
  if (typeof navigator === 'undefined') return () => undefined;

  const mediaSession = (navigator as Navigator & { mediaSession?: MediaSessionLike }).mediaSession;
  if (!mediaSession || typeof mediaSession.setActionHandler !== 'function') return () => undefined;

  const actions = ['play', 'pause', 'nexttrack', 'previoustrack'];
  const setAction = (action: string, handler: (() => void) | null) => {
    try {
      mediaSession.setActionHandler(action, handler);
    } catch {
      // Safari can expose Media Session but reject unsupported actions.
    }
  };

  let ownedMetadata: unknown = null;
  if (typeof MediaMetadata !== 'undefined') {
    try {
      ownedMetadata = new MediaMetadata({
        title: options.episodeTitle || (options.episodeNumber === undefined
          ? options.title
          : `${options.title} · Episode ${options.episodeNumber}`),
        artist: 'Miruro',
        album: options.title,
        artwork: options.artwork ? [{ src: options.artwork }] : [],
      });
      mediaSession.metadata = ownedMetadata;
    } catch {
      ownedMetadata = null;
    }
  }

  setAction('play', options.onPlay);
  setAction('pause', options.onPause);
  if (options.onNext) setAction('nexttrack', options.onNext);
  if (options.onPrevious) setAction('previoustrack', options.onPrevious);

  return () => {
    for (const action of actions) setAction(action, null);
    if (ownedMetadata && mediaSession.metadata === ownedMetadata) mediaSession.metadata = null;
  };
}
