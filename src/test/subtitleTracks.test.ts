import { describe, expect, it } from 'vitest';
import {
  createSubtitleTrackId,
  normalizeSubtitleTracks,
  preferredSubtitleTrack,
} from '../client/subtitleTracks';

describe('managed subtitle track identity', () => {
  it('does not reuse an identity when the episode changes', () => {
    const url = 'https://cdn.example.test/english.vtt';
    expect(createSubtitleTrackId('show-episode-1', url, 'en'))
      .not.toBe(createSubtitleTrackId('show-episode-2', url, 'en'));
  });

  it('keeps duplicate English tracks distinct by URL', () => {
    const tracks = normalizeSubtitleTracks('show-episode-1', [
      { url: 'https://cdn.example.test/a.vtt', lang: 'en', name: 'English' },
      { url: 'https://cdn.example.test/b.vtt', lang: 'en', name: 'English' },
      { url: 'https://cdn.example.test/a.vtt', lang: 'en', name: 'English' },
    ]);

    expect(tracks).toHaveLength(2);
    expect(new Set(tracks.map((track) => track.id)).size).toBe(2);
  });

  it('drops empty URLs and chooses English before another language', () => {
    const tracks = normalizeSubtitleTracks('show-episode-1', [
      { url: '', lang: 'ja', name: 'Japanese' },
      { url: 'https://cdn.example.test/ja.vtt', lang: 'ja', name: 'Japanese' },
      { url: 'https://cdn.example.test/en.vtt', lang: 'en', name: 'English' },
    ]);

    expect(tracks).toHaveLength(2);
    expect(preferredSubtitleTrack(tracks)?.name).toBe('English');
  });

  it('falls back to the first available track when English is absent', () => {
    const tracks = normalizeSubtitleTracks('show-episode-1', [
      { url: 'https://cdn.example.test/pt.vtt', lang: 'pt', name: 'Portuguese' },
      { url: 'https://cdn.example.test/es.vtt', lang: 'es', name: 'Spanish' },
    ]);

    expect(preferredSubtitleTrack(tracks)?.name).toBe('Portuguese');
  });
});
