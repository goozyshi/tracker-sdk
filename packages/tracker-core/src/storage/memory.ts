import type { KVStorage } from './index';

export function createMemoryStorage(): KVStorage {
  const map = new Map<string, string>();
  return {
    available: true,
    get(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    set(key, value) {
      map.set(key, value);
    },
    remove(key) {
      map.delete(key);
    },
  };
}
