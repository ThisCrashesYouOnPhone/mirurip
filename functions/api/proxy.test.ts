import { describe, expect, it } from 'vitest';
import { getMediaContentType } from './proxy';

describe('HLS proxy media content types', () => {
  it('normalizes obfuscated AniKoto MPEG-TS segment extensions', () => {
    expect(
      getMediaContentType(
        new URL('https://cr0x1.cloudvideo.lat/anime/id/seg-1-f1-v1-a1.jpg'),
        'image/jpeg',
      ),
    ).toBe('video/mp2t');
  });

  it('normalizes ordinary TS segments', () => {
    expect(getMediaContentType(new URL('https://cdn.example/segment-1.ts'), 'application/octet-stream')).toBe('video/mp2t');
  });

  it('preserves non-segment content types', () => {
    expect(getMediaContentType(new URL('https://cdn.example/subtitles/en.vtt'), 'text/vtt; charset=utf-8')).toBe('text/vtt');
  });
});
