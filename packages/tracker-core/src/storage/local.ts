import type { KVStorage, StorageChangeHandler } from './index';

function detectAvailable(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return false;
  try {
    const probe = '__tracker_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export interface LocalStorageOptions {
  onQuotaExceeded?: (err: Error) => void;
}

export function createLocalStorage(options: LocalStorageOptions = {}): KVStorage {
  const available = detectAvailable();

  return {
    available,
    get(key) {
      if (!available) return null;
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      if (!available) return;
      try {
        window.localStorage.setItem(key, value);
      } catch (err) {
        options.onQuotaExceeded?.(err as Error);
      }
    },
    remove(key) {
      if (!available) return;
      try {
        window.localStorage.removeItem(key);
      } catch {
        // noop
      }
    },
    onChange(handler: StorageChangeHandler) {
      if (!available || typeof window === 'undefined') return () => {};
      const listener = (e: StorageEvent) => {
        if (e.key == null) return;
        handler(e.key, e.newValue);
      };
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    },
  };
}
