import { afterEach, describe, expect, it } from 'vitest';
import { setupMediaSession } from '../client/mediaSession';

describe('Media Session controls', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaSession');

  afterEach(() => {
    if (originalDescriptor) Object.defineProperty(navigator, 'mediaSession', originalDescriptor);
    else Reflect.deleteProperty(navigator, 'mediaSession');
  });

  it('registers supported episode actions and removes them during cleanup', () => {
    const handlers = new Map<string, (() => void) | null>();
    const mediaSession = {
      metadata: null,
      setActionHandler: (action: string, handler: (() => void) | null) => handlers.set(action, handler),
    };
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: mediaSession });

    let played = 0;
    let paused = 0;
    let next = 0;
    let previous = 0;
    const cleanup = setupMediaSession({
      title: 'Example',
      episodeNumber: 2,
      onPlay: () => { played += 1; },
      onPause: () => { paused += 1; },
      onNext: () => { next += 1; },
      onPrevious: () => { previous += 1; },
    });

    handlers.get('play')?.();
    handlers.get('pause')?.();
    handlers.get('nexttrack')?.();
    handlers.get('previoustrack')?.();
    expect({ played, paused, next, previous }).toEqual({ played: 1, paused: 1, next: 1, previous: 1 });

    cleanup();
    expect(handlers.get('play')).toBeNull();
    expect(handlers.get('pause')).toBeNull();
    expect(handlers.get('nexttrack')).toBeNull();
    expect(handlers.get('previoustrack')).toBeNull();
  });
});
