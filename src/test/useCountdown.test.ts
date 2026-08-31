import { describe, expect, it } from 'vitest';
import { formatCountdown } from '../hooks/useCountdown';

describe('airing countdown formatting', () => {
  it('formats days, hours, minutes, and seconds', () => {
    expect(formatCountdown(
      (((1 * 24 + 4) * 60 + 12) * 60 + 9) * 1000,
    )).toBe('1 days, 4 hours, 12 minutes, 9 seconds');
  });

  it('rolls over to an aired state at zero', () => {
    expect(formatCountdown(0)).toBe('Airing now or aired');
  });
});
