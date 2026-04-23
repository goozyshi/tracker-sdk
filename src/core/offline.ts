import type { Tracker } from './tracker';
import type { DispatchEvent, OfflineOptions } from './types';
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

  saveAll(events: DispatchEvent[]): void {
    if (!this.options.enabled) return;
    if (typeof localStorage === 'undefined') return;

    const stored = this.load();
    stored.push(...events);

    while (stored.length > this.options.maxSize) {
      stored.shift();
    }

    localStorage.setItem(this.key, JSON.stringify(stored));
  }

  private load(): DispatchEvent[] {
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
    const valid = stored.filter((item) => now - item.timestamp < this.options.maxAge * 1000);

    if (!valid.length) {
      localStorage.removeItem(this.key);
      return;
    }

    const groups = new Map<string, DispatchEvent[]>();
    for (const item of valid) {
      const key = item.reporters?.slice().sort().join(',') ?? '*';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    }

    const batches = Array.from(groups.values()).flatMap((events) => chunk(events, 20));

    for (const batch of batches) {
      try {
        await this.tracker.sendBatch(batch, this.tracker.getReporters(batch[0]?.reporters));
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
