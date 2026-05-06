import type { Sender } from '../reporter/sender';
import type { ResolvedQueueConfig } from '../types/config';
import type { EventEnvelope } from '../types/event';
import type { OfflineManager } from './offline';

export interface BucketedQueueOptions {
  sender: Sender;
  offline: OfflineManager;
  config: ResolvedQueueConfig;
}

export class BucketedQueue {
  private sender: Sender;
  private offline: OfflineManager;
  private config: ResolvedQueueConfig;
  private buckets = new Map<string, EventEnvelope[]>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private bytesByBucket = new Map<string, number>();
  private unloadHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;

  constructor(options: BucketedQueueOptions) {
    this.sender = options.sender;
    this.offline = options.offline;
    this.config = options.config;
  }

  start(): void {
    this.bootstrapFromOffline();
    this.timer = setInterval(() => this.flushAll(), this.config.flushInterval);
    if (this.config.flushOnUnload) this.bindUnload();
  }

  add(batchKey: string, envelope: EventEnvelope): void {
    const bucket = this.buckets.get(batchKey) ?? [];
    bucket.push(envelope);
    this.buckets.set(batchKey, bucket);

    const size = (this.bytesByBucket.get(batchKey) ?? 0) + estimateBytes(envelope);
    this.bytesByBucket.set(batchKey, size);

    if (bucket.length >= this.config.flushBatchSize || size >= this.config.maxBatchBytes) {
      void this.flush(batchKey);
    }
  }

  async flush(batchKey: string): Promise<void> {
    const bucket = this.buckets.get(batchKey);
    if (!bucket?.length) return;
    const items = bucket.splice(0);
    this.bytesByBucket.set(batchKey, 0);
    await this.sender.send(batchKey, items, { sync: false });
  }

  async flushAll(): Promise<void> {
    for (const batchKey of this.buckets.keys()) {
      await this.flush(batchKey);
    }
  }

  flushSync(): void {
    for (const [batchKey, bucket] of this.buckets.entries()) {
      if (!bucket.length) continue;
      const items = bucket.splice(0);
      this.bytesByBucket.set(batchKey, 0);
      void this.sender.send(batchKey, items, { sync: true });
    }
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.unbindUnload();
    this.buckets.clear();
    this.bytesByBucket.clear();
  }

  private bootstrapFromOffline(): void {
    for (const batchKey of this.offline.knownBatchKeys()) {
      const items = this.offline.load(batchKey);
      if (!items.length) {
        this.offline.clear(batchKey);
        continue;
      }
      this.offline.clear(batchKey);
      const bucket = this.buckets.get(batchKey) ?? [];
      bucket.push(...items);
      this.buckets.set(batchKey, bucket);
      this.bytesByBucket.set(
        batchKey,
        (this.bytesByBucket.get(batchKey) ?? 0) +
          items.reduce((sum, e) => sum + estimateBytes(e), 0)
      );
      void this.flush(batchKey);
    }
  }

  private bindUnload(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    this.visibilityHandler = () => {
      if (document.visibilityState === 'hidden') this.flushSync();
    };
    this.unloadHandler = () => this.flushSync();
    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('pagehide', this.unloadHandler);
  }

  private unbindUnload(): void {
    if (typeof document !== 'undefined' && this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window !== 'undefined' && this.unloadHandler) {
      window.removeEventListener('pagehide', this.unloadHandler);
    }
    this.visibilityHandler = null;
    this.unloadHandler = null;
  }
}

function estimateBytes(envelope: EventEnvelope): number {
  try {
    return JSON.stringify(envelope).length;
  } catch {
    return 0;
  }
}
