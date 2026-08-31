import { describe, expect, it } from 'vitest';
import {
  generateChapterVtt,
  normalizeSkipTimes,
  shouldAutoSkipPreview,
  synthesizeSeanimeChapters,
} from '../client/chapterTimes';

describe('chapter timing', () => {
  it('aligns AniSkip intervals to the loaded stream and keeps the best result per chapter', () => {
    const normalized = normalizeSkipTimes([
      {
        interval: { startTime: 80, endTime: 170 },
        skipType: 'op',
        episodeLength: 1420,
      },
      {
        interval: { startTime: 82, endTime: 172 },
        skipType: 'op',
        episodeLength: 1440,
      },
      {
        interval: { startTime: 1300, endTime: 1390 },
        skipType: 'ed',
        episodeLength: 1420,
      },
    ], 1440);

    expect(normalized).toHaveLength(2);
    expect(normalized[0].interval).toEqual({ startTime: 82, endTime: 172 });
    expect(normalized[1].interval).toEqual({ startTime: 1320, endTime: 1410 });
  });

  it('creates valid chapter VTT timestamps and non-overlapping episode sections', () => {
    const vtt = generateChapterVtt([
      { interval: { startTime: 85.5, endTime: 175.2 }, skipType: 'op' },
      { interval: { startTime: 1300, endTime: 1390 }, skipType: 'ed' },
    ], 1420, 'Example', '1');

    expect(vtt).toContain('00:00:00.000 --> 00:01:25.500');
    expect(vtt).toContain('00:01:25.500 --> 00:02:55.200');
    expect(vtt).toContain('Opening');
    expect(vtt).toContain('Ending');
    expect(vtt).toContain('00:23:10.000 --> 00:23:40.000');
  });

  it('preserves an explicit preview without inventing one for an epilogue', () => {
    const withPreview = synthesizeSeanimeChapters([
      { interval: { startTime: 80, endTime: 170 }, skipType: 'op' },
      { interval: { startTime: 1300, endTime: 1390 }, skipType: 'ed' },
      { interval: { startTime: 1395, endTime: 1415 }, skipType: 'preview' },
    ], 1420);
    expect(withPreview.find((cue) => cue.type === 'preview')).toMatchObject({
      startTime: 1395,
      endTime: 1415,
      text: 'Preview',
    });

    const ordinaryTail = synthesizeSeanimeChapters([
      { interval: { startTime: 80, endTime: 170 }, skipType: 'op' },
      { interval: { startTime: 1300, endTime: 1390 }, skipType: 'ed' },
    ], 1420);
    expect(ordinaryTail.at(-1)).toMatchObject({ type: 'epilogue', text: 'Epilogue' });
    expect(ordinaryTail.some((cue) => cue.type === 'preview')).toBe(false);
  });

  it('clamps and trims overlapping normalized intervals', () => {
    const normalized = normalizeSkipTimes([
      { interval: { startTime: 10, endTime: 50 }, skipType: 'op' },
      { interval: { startTime: 40, endTime: 80 }, skipType: 'ed' },
      { interval: { startTime: 500, endTime: 900 }, skipType: 'preview' },
    ], 60);

    expect(normalized.every((item) => item.interval.startTime >= 0 && item.interval.endTime <= 60)).toBe(true);
    expect(normalized[0].interval).toEqual({ startTime: 10, endTime: 50 });
    expect(normalized[1].interval).toEqual({ startTime: 50, endTime: 60 });
    expect(normalized[2]).toBeUndefined();
  });

  it('only auto-skips an explicit preview when Auto Next has a destination', () => {
    const preview = { startTime: 100, endTime: 120 };
    expect(shouldAutoSkipPreview(true, true, 110, preview)).toBe(true);
    expect(shouldAutoSkipPreview(false, true, 110, preview)).toBe(false);
    expect(shouldAutoSkipPreview(true, false, 110, preview)).toBe(false);
    expect(shouldAutoSkipPreview(true, true, 110, null)).toBe(false);
    expect(shouldAutoSkipPreview(true, true, 110, preview, true)).toBe(false);
  });
});
