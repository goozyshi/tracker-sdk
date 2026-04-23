import type { OfflineManager } from './offline';
import type { Tracker } from './tracker';
import type { BatchOptions, DispatchEvent, Reporter, ReporterContext } from './types';

interface QueueItem extends DispatchEvent {
  targetReporters: Reporter[];
}

export class BatchManager {
  private queue: QueueItem[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private options: Required<BatchOptions>;
  private tracker: Tracker;
  private offlineManager: OfflineManager | null;

  constructor(options: BatchOptions = {}, tracker: Tracker, offlineManager: OfflineManager | null) {
    this.options = {
      enabled: true,
      maxSize: 20,
      interval: 5000,
      flushOnUnload: true,
      ...options,
    };
    this.tracker = tracker;
    this.offlineManager = offlineManager;

    this.startTimer();
    if (this.options.flushOnUnload) {
      this.bindUnload();
    }
  }

  add(event: DispatchEvent, reporters: Reporter[]): void {
    this.queue.push({ ...event, targetReporters: reporters });
    if (this.queue.length >= this.options.maxSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.queue.length) return;

    const items = this.queue.splice(0, this.options.maxSize);

    // 按 reporters 分组
    const groups = new Map<string, { reporters: Reporter[]; events: DispatchEvent[] }>();

    for (const item of items) {
      const key = item.targetReporters
        .map((r) => r.name)
        .sort()
        .join(',');
      if (!groups.has(key)) {
        groups.set(key, { reporters: item.targetReporters, events: [] });
      }
      groups.get(key)!.events.push({
        event: item.event,
        data: item.data,
        timestamp: item.timestamp,
        reporters: item.reporters,
        reporterData: item.reporterData,
      });
    }

    for (const { reporters, events } of groups.values()) {
      try {
        await this.sendBatch(events, reporters);
      } catch {
        this.offlineManager?.saveAll(events);
      }
    }
  }

  async sendBatch(
    batch: DispatchEvent[],
    reporters?: Reporter[],
    ctx?: ReporterContext
  ): Promise<void> {
    await this.tracker.sendBatch(batch, reporters, ctx);
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

    const items = this.queue.splice(0);

    const groups = new Map<string, { reporters: Reporter[]; events: DispatchEvent[] }>();
    for (const item of items) {
      const key = item.targetReporters
        .map((r) => r.name)
        .sort()
        .join(',');
      if (!groups.has(key)) {
        groups.set(key, { reporters: item.targetReporters, events: [] });
      }
      groups.get(key)!.events.push({
        event: item.event,
        data: item.data,
        timestamp: item.timestamp,
        reporters: item.reporters,
        reporterData: item.reporterData,
      });
    }

    for (const { reporters, events } of groups.values()) {
      const onFail = () => this.offlineManager?.saveAll(events);
      try {
        const result = this.sendBatch(events, reporters, { sync: true });
        if (result && typeof result.catch === 'function') {
          result.catch(onFail);
        }
      } catch {
        onFail();
      }
    }
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
