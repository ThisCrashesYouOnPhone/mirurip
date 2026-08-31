/**
 * safeStorage.ts
 *
 * Safe localStorage helpers that never throw — in particular they catch
 * QuotaExceededError that would otherwise crash the app when storage grows
 * past the quota on iOS Safari / iPad WebKit or in private browsing mode.
 */

export function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      // Evict the single largest non-critical key and retry once
      try {
        let largestKey = '';
        let largestSize = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k !== key && !k.startsWith('accessToken') && !k.startsWith('themePreference')) {
            const size = (localStorage.getItem(k) || '').length;
            if (size > largestSize) {
              largestKey = k;
              largestSize = size;
            }
          }
        }
        if (largestKey) {
          localStorage.removeItem(largestKey);
        }
        localStorage.setItem(key, value);
      } catch {
        console.warn(`[safeStorage] Could not write "${key}" even after eviction.`);
      }
    } else {
      console.warn('[safeStorage] Storage write error:', e);
    }
  }
}

export function safeLocalStorageGet(key: string, fallback: string = ''): string {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
}

export function safeLocalStorageGetJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeLocalStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage remove errors
  }
}
