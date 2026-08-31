import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUBTITLE_SETTINGS,
  normalizeSubtitleSettings,
  subtitleStyleVariables,
} from '../components/Watch/Video/useSubtitleSettings';

describe('subtitle appearance settings', () => {
  it('uses readable defaults for missing or invalid saved data', () => {
    expect(normalizeSubtitleSettings(null)).toEqual(DEFAULT_SUBTITLE_SETTINGS);
    expect(normalizeSubtitleSettings({ fontSize: 'giant', background: 'glass' }))
      .toEqual(DEFAULT_SUBTITLE_SETTINGS);
  });

  it('preserves supported settings and maps them to live CSS variables', () => {
    const settings = { fontSize: 'large' as const, background: 'semi' as const };
    const styles = subtitleStyleVariables(settings);
    expect(styles['--sub-font-size']).toContain('4.2cqi');
    expect(styles['--sub-bg']).toBe('rgba(0, 0, 0, 0.65)');
  });
});
