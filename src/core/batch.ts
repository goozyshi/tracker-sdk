import type { BatchOptions, Reporter, TrackEvent } from './types';
import type { OfflineManager } from './offline';

interface QueueItem extends TrackEvent {
  reporters: Reporter[];
}

export class BatchManager {
  private queue: QueueItem[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private options: Required<BatchOptions>;
  private reporters: Reporter[];
  private offlineManager: OfflineManager | null;

  constructor(
    options: BatchOptions = {},
    reporters: Reporter[],
    offlineManager: OfflineManager | null
  ) {
    this.options = {
      enabled: true,
      maxSize: 20,
      interval: 5000,
      flushOnUnload: true,
      ...options,
    };
    this.reporters = reporters;
    this.offlineManager = offlineManager;

    this.startTimer();
    if (this.options.flushOnUnload) {
      this.bindUnload();
    }
  }

  setReporters(reporters: Reporter[]): void {
    this.reporters = reporters;
  }

  add(event: string, data: Record<string, any>, reporters: Reporter[]): void {
    this.queue.push({ event, data, timestamp: Date.now(), reporters });
    if (this.queue.length >= this.options.maxSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.queue.length) return;

    const items = this.queue.splice(0, this.options.maxSize);
    
    // 按 reporters 分组
    const groups = new Map<string, { reporters: Reporter[]; events: TrackEvent[] }>();
    
    for (const item of items) {
      const key = item.reporters.map(r => r.name).sort().join(',');
      if (!groups.has(key)) {
        groups.set(key, { reporters: item.reporters, events: [] });
      }
      groups.get(key)!.events.push({
        event: item.event,
        data: item.data,
        timestamp: item.timestamp,
      });
    }

    // 分组发送
    for (const { reporters, events } of groups.values()) {
      try {
        await this.sendBatch(events, reporters);
      } catch {
        this.offlineManager?.saveAll(events);
      }
    }
  }

  async sendBatch(batch: TrackEvent[], reporters?: Reporter[]): Promise<void> {
    const targets = reporters ?? this.reporters;
    for (const reporter of targets) {
      if (reporter.batchTrack) {
        await reporter.batchTrack(batch);
      } else {
        for (const item of batch) {
          await reporter.track(item.event, item.data);
        }
      }
    }
  }

  private startTimer(): void {
    this.timer = setInterval(() => this.flush(), this.options.interval);
  }

  private bindUnload(): void {
    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushSync();
      }
    });
  }

  private flushSync(): void {
    if (!this.queue.length) return;

    const batch = this.queue.splice(0);
    const data = JSON.stringify({ events: batch });

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/track/batch', data);
    } else {
      this.offlineManager?.saveAll(batch);
    }
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
