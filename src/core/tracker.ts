import { BatchManager } from './batch';
import { withFilter, withGlobalData, withTransformer } from './middleware';
import { OfflineManager } from './offline';
import type {
  DataProvider,
  FilterFn,
  Middleware,
  MiddlewareContext,
  Reporter,
  ReporterContext,
  TrackEvent,
  TrackerOptions,
  TransformFn,
} from './types';

export class Tracker {
  private reporters: Reporter[] = [];
  private middlewares: Middleware[] = [];
  private options: TrackerOptions = {};
  private failedQueue: { reporter: string; event: string; data: any; retries: number }[] = [];
  private batchManager: BatchManager | null = null;
  private offlineManager: OfflineManager | null = null;

  constructor(options: TrackerOptions = {}) {
    if (Object.keys(options).length > 0) {
      this.init(options);
    }
  }

  init(options: TrackerOptions): this {
    this.options = { ...this.options, ...options };

    if (options.offline?.enabled && !this.offlineManager) {
      this.offlineManager = new OfflineManager(options.offline, this);
    }

    if (options.batch?.enabled && !this.batchManager) {
      this.batchManager = new BatchManager(options.batch, this.reporters, this.offlineManager);
    }

    return this;
  }

  addReporter(reporter: Reporter): this {
    reporter.init?.();
    this.reporters.push(reporter);
    if (this.batchManager) {
      this.batchManager.setReporters(this.reporters);
    }
    return this;
  }

  use(fn: Middleware): this {
    this.middlewares.push(fn);
    return this;
  }

  setGlobalData(provider: DataProvider): this {
    return this.use(withGlobalData(provider));
  }

  transform(fn: TransformFn): this {
    return this.use(withTransformer(fn));
  }

  filter(predicate: FilterFn): this {
    return this.use(withFilter(predicate));
  }

  track(event: string, data?: Record<string, any>): void {
    const ctx: MiddlewareContext = { event, data: { ...data } };

    let idx = 0;
    const next = () => {
      if (idx < this.middlewares.length) {
        this.middlewares[idx++](ctx, next);
      } else {
        this.dispatch(ctx.event, ctx.data);
      }
    };
    next();
  }

  private dispatch(event: string, data: Record<string, any>): void {
    const { _reporters, ...cleanData } = data;

    const targetNames = _reporters ?? this.options.defaultReporters;
    const targetReporters = targetNames
      ? this.reporters.filter((r) => targetNames.includes(r.name))
      : this.reporters;

    if (this.batchManager) {
      this.batchManager.add(event, cleanData, targetReporters);
    } else {
      this.sendToReporters(event, cleanData, targetReporters);
    }
  }

  sendToReporters(event: string, data: Record<string, any>, reporters?: Reporter[]): void {
    const targets = reporters ?? this.reporters;
    targets.forEach(async (r) => {
      try {
        await r.track(event, data);
      } catch (err) {
        this.handleError(err as Error, r.name, event, data);
      }
    });
  }

  async sendBatch(
    batch: TrackEvent[],
    reporters?: Reporter[],
    ctx?: ReporterContext
  ): Promise<void> {
    const targets = reporters ?? this.reporters;
    for (const reporter of targets) {
      if (reporter.batchTrack) {
        await reporter.batchTrack(batch, ctx);
      } else {
        for (const item of batch) {
          await reporter.track(item.event, item.data, ctx);
        }
      }
    }
  }

  private handleError(err: Error, reporter: string, event: string, data: any): void {
    this.options.onError?.(err, reporter, event, data);

    if (this.options.retry) {
      this.failedQueue.push({ reporter, event, data, retries: 0 });
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    const retry = this.options.retry;
    if (!retry) return;

    const { max, delay } = retry;

    setTimeout(() => {
      const item = this.failedQueue.shift();
      if (!item || item.retries >= max) return;

      const r = this.reporters.find((r) => r.name === item.reporter);
      if (r) {
        Promise.resolve(r.track(item.event, item.data)).catch(() => {
          this.failedQueue.push({ ...item, retries: item.retries + 1 });
          this.scheduleRetry();
        });
      }
    }, delay);
  }

  destroy(): void {
    this.reporters.forEach((r) => {
      r.destroy?.();
    });
    this.reporters = [];
    this.middlewares = [];
    this.failedQueue = [];
    this.batchManager = null;
    this.offlineManager = null;
  }
}

export const createTracker = (options?: TrackerOptions): Tracker => new Tracker(options);

const TRACKER_KEY = '__TRACKER_SDK_INSTANCE__';

function getGlobalTracker(): Tracker {
  const g = (typeof window !== 'undefined' ? window : globalThis) as any;
  if (!g[TRACKER_KEY]) {
    g[TRACKER_KEY] = new Tracker();
  }
  return g[TRACKER_KEY];
}

export const tracker = getGlobalTracker();
