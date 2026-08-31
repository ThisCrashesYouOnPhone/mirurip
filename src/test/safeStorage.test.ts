import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  safeLocalStorageSet,
  safeLocalStorageGet,
  safeLocalStorageGetJson,
  safeLocalStorageRemove,
} from '../client/safeStorage';

describe('safeStorage (iPad / WebKit Low-Memory & QuotaExceeded Protection)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should safely store and retrieve values', () => {
    safeLocalStorageSet('test_key', 'test_value');
    expect(safeLocalStorageGet('test_key')).toBe('test_value');
  });

  it('should return fallback if key is missing', () => {
    expect(safeLocalStorageGet('non_existent', 'default_fallback')).toBe('default_fallback');
  });

  it('should safely serialize and deserialize JSON with typed fallback', () => {
    const data = { theme: 'dark', volume: 0.8, recentIds: [1, 2, 3] };
    safeLocalStorageSet('user_prefs', JSON.stringify(data));

    const retrieved = safeLocalStorageGetJson('user_prefs', { theme: 'light', volume: 1, recentIds: [] });
    expect(retrieved).toEqual(data);
  });

  it('should gracefully handle invalid JSON without crashing', () => {
    localStorage.setItem('corrupt_key', '{invalid-json:');
    const fallback = { fallback: true };
    const result = safeLocalStorageGetJson('corrupt_key', fallback);
    expect(result).toEqual(fallback);
  });

  it('should safely remove keys', () => {
    safeLocalStorageSet('to_delete', 'value');
    safeLocalStorageRemove('to_delete');
    expect(safeLocalStorageGet('to_delete')).toBe('');
  });

  it('should handle QuotaExceededError by evicting large non-critical cache and retrying', () => {
    // Fill storage with a large stale cache item and critical auth item
    localStorage.setItem('accessToken', 'critical-auth-token-12345');
    localStorage.setItem('cache_huge_query', 'x'.repeat(5000));
    localStorage.setItem('themePreference', 'dark');

    let quotaThrown = false;
    const originalSetItem = localStorage.setItem.bind(localStorage);

    // Mock setItem to throw QuotaExceededError on first attempt, then succeed after eviction
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      if (!quotaThrown && key === 'new_stream_data') {
        quotaThrown = true;
        const err = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        throw err;
      }
      return originalSetItem(key, value);
    });

    safeLocalStorageSet('new_stream_data', 'stream_content_success');

    // The largest non-critical key ('cache_huge_query') should have been evicted
    expect(localStorage.getItem('cache_huge_query')).toBeNull();
    // Critical keys must NEVER be evicted
    expect(localStorage.getItem('accessToken')).toBe('critical-auth-token-12345');
    expect(localStorage.getItem('themePreference')).toBe('dark');
  });
});
