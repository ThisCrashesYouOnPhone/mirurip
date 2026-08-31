import { describe, expect, it } from 'vitest';
import { selectAniKotoPanelType } from './alternateSources';

describe('AniKoto subtitle mode mapping', () => {
  it('maps AniKoto sub to S-Sub when the provider exposes its legacy label', () => {
    expect(selectAniKotoPanelType(['sub', 'dub'], 'ssub')).toBe('sub');
  });

  it('uses the explicit hard-sub panel when AniKoto provides one', () => {
    expect(selectAniKotoPanelType(['sub', 'hsub', 'dub'], 'hsub')).toBe('hsub');
  });

  it('can use AniKoto sub video for H-Sub without changing it into S-Sub', () => {
    expect(selectAniKotoPanelType(['sub', 'dub'], 'hsub')).toBe('sub');
  });

  it('never uses a subtitle panel for Dub', () => {
    expect(selectAniKotoPanelType(['sub'], 'dub')).toBeUndefined();
  });
});
