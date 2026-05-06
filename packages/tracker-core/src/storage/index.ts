export type StorageChangeHandler = (key: string, value: string | null) => void;

export interface KVStorage {
  readonly available: boolean;
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  onChange?(handler: StorageChangeHandler): () => void;
}

export { createLocalStorage } from './local';
export { createMemoryStorage } from './memory';
