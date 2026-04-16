import type { OfflineOptions, TrackEvent } from './types';
import type { Tracker } from './tracker';
import { chunk, sleep } from './utils';

export class OfflineManager {
  private key = 'tracker_offline';
  private options: Required<OfflineOptions>;
  private tracker: Tracker;

  constructor(options: OfflineOptions = {}, tracker: Tracker) {
    this.options = {
      enabled: true,
      storage: 'localStorage',
      maxSize: 200,
      maxAge: 7 * 24 * 60 * 60,
      ...options,
    };
    this.tracker = tracker;

    this.bindOnline();
    this.flushOnStart();
  }

  saveAll(events: TrackEvent[]): void {
    if (!this.options.enabled) return;
    if (typeof localStorage === 'undefined') return;

    const stored = this.load();
    stored.push(...events);

    while (stored.length > this.options.maxSize) {
      stored.shift();
    }

    localStorage.setItem(this.key, JSON.stringify(stored));
  }

  private load(): TrackEvent[] {
    if (typeof localStorage === 'undefined') return [];

    try {
      return JSON.parse(localStorage.getItem(this.key) || '[]');
    } catch {
      return [];
    }
  }

  private bindOnline(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => this.flush(), { timeout: 10000 });
      } else {
        setTimeout(() => this.flush(), 1000);
      }
    });
  }

  private flushOnStart(): void {
    if (typeof window === 'undefined') return;

    setTimeout(() => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => this.flush(), { timeout: 10000 });
      } else {
        this.flush();
      }
    }, 3000);
  }

  private async flush(): Promise<void> {
    const stored = this.load();
    if (!stored.length) return;

    const now = Date.now();
    const valid = stored.filter(
      item => now - item.timestamp < this.options.maxAge * 1000
    );

    if (!valid.length) {
      localStorage.removeItem(this.key);
      return;
    }

    const batches = chunk(valid, 20);

    for (const batch of batches) {
      try {
        await this.tracker.sendBatch(batch);
        await sleep(1000);
      } catch {
        const idx = batches.indexOf(batch);
        const remaining = batches.slice(idx).flat();
        localStorage.setItem(this.key, JSON.stringify(remaining));
        return;
      }
    }

    localStorage.removeItem(this.key);
  }
}
