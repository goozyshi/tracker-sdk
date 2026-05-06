import type { KVStorage } from '../storage/index';
import type { TrackerErrorHandler } from '../types/config';
import type { EventEnvelope } from '../types/event';
import {
  offlineKey,
  readBatchKeyIndex,
  readEnvelopes,
  writeBatchKeyIndex,
  writeEnvelopes,
} from './persistence';

export interface OfflineManagerOptions {
  storage: KVStorage;
  storageKeyPrefix: string;
  maxSize: number;
  maxAgeSeconds: number;
  onError: TrackerErrorHandler;
}

export class OfflineManager {
  private storage: KVStorage;
  private prefix: string;
  private maxSize: number;
  private maxAgeMs: number;
  private onError: TrackerErrorHandler;
  private knownKeys: Set<string>;

  constructor(options: OfflineManagerOptions) {
    this.storage = options.storage;
    this.prefix = options.storageKeyPrefix;
    this.maxSize = options.maxSize;
    this.maxAgeMs = options.maxAgeSeconds * 1000;
    this.onError = options.onError;
    this.knownKeys = readBatchKeyIndex(this.storage, this.prefix);
  }

  save(batchKey: string, envelopes: EventEnvelope[]): void {
    if (!envelopes.length) return;
    const key = offlineKey(this.prefix, batchKey);
    const existing = readEnvelopes(this.storage, key);
    const merged = existing.concat(envelopes);

    while (merged.length > this.maxSize) {
      merged.shift();
    }

    try {
      writeEnvelopes(this.storage, key, merged);
    } catch (err) {
      this.onError(err as Error, 'storage_full', { batchKey });
      return;
    }

    if (!this.knownKeys.has(batchKey)) {
      this.knownKeys.add(batchKey);
      writeBatchKeyIndex(this.storage, this.prefix, this.knownKeys);
    }
  }

  load(batchKey: string): EventEnvelope[] {
    const key = offlineKey(this.prefix, batchKey);
    const items = readEnvelopes(this.storage, key);
    const now = Date.now();
    const valid = items.filter((env) => now - env.time < this.maxAgeMs);
    if (valid.length !== items.length) writeEnvelopes(this.storage, key, valid);
    return valid;
  }

  clear(batchKey: string): void {
    writeEnvelopes(this.storage, offlineKey(this.prefix, batchKey), []);
    if (this.knownKeys.delete(batchKey)) {
      writeBatchKeyIndex(this.storage, this.prefix, this.knownKeys);
    }
  }

  knownBatchKeys(): string[] {
    return Array.from(this.knownKeys);
  }
}
