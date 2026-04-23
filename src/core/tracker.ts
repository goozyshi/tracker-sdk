import { BatchManager } from './batch';
import { withFilter, withGlobalData, withTransformer } from './middleware';
import { createMiddlewareReporter } from './middleware-reporter';
import { OfflineManager } from './offline';
import type {
  DataProvider,
  DispatchEvent,
  FilterFn,
  Middleware,
  MiddlewareContext,
  Reporter,
  ReporterContext,
  ReporterDataMap,
  TrackEvent,
  TrackerOptions,
  TrackOptions,
  TransformFn,
} from './types';
import { cloneDeep } from './utils';

export class Tracker {
  private reporters: Reporter[] = [];
  private middlewares: Middleware[] = [];
  private options: TrackerOptions = {};
  private reporterDataProviders = new Map<string, DataProvider[]>();
  private failedQueue: {
    reporter: string;
    event: string;
    data: Record<string, any>;
    privateData?: Record<string, any>;
    retries: number;
  }[] = [];
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
      this.batchManager = new BatchManager(options.batch, this, this.offlineManager);
    }

    if (options.middlewareReporter) {
      this.upsertReporter(createMiddlewareReporter(options.middlewareReporter));
    }

    return this;
  }

  addReporter(reporter: Reporter): this {
    reporter.init?.();
    this.reporters.push(reporter);
    return this;
  }

  use(fn: Middleware): this {
    this.middlewares.push(fn);
    return this;
  }

  setGlobalData(provider: DataProvider): this {
    return this.use(withGlobalData(provider));
  }

  setReporterGlobalData(name: string, provider: DataProvider): this {
    const providers = this.reporterDataProviders.get(name) ?? [];
    providers.push(provider);
    this.reporterDataProviders.set(name, providers);
    return this;
  }

  transform(fn: TransformFn): this {
    return this.use(withTransformer(fn));
  }

  filter(predicate: FilterFn): this {
    return this.use(withFilter(predicate));
  }

  track(event: string, data?: Record<string, any>, options: TrackOptions = {}): void {
    const ctx: MiddlewareContext = { event, data: { ...data } };

    let idx = 0;
    const next = () => {
      if (idx < this.middlewares.length) {
        this.middlewares[idx++](ctx, next);
      } else {
        this.dispatch(ctx.event, ctx.data, options);
      }
    };
    next();
  }

  private dispatch(event: string, data: Record<string, any>, options: TrackOptions = {}): void {
    const targetNames = options.reporters ?? this.options.defaultReporters;
    const targetReporters = targetNames
      ? this.reporters.filter((r) => targetNames.includes(r.name))
      : this.reporters;
    const dispatchEvent = this.createDispatchEvent(
      event,
      data,
      targetReporters,
      options.reporterData
    );

    if (this.batchManager) {
      this.batchManager.add(dispatchEvent, targetReporters);
    } else {
      this.sendToReporters(dispatchEvent, targetReporters);
    }
  }

  getReporters(names?: string[]): Reporter[] {
    return names
      ? this.reporters.filter((reporter) => names.includes(reporter.name))
      : this.reporters;
  }

  sendToReporters(event: DispatchEvent, reporters?: Reporter[]): void {
    const targets = reporters ?? this.reporters;
    targets.forEach(async (r) => {
      const reporterCtx = this.createReporterContext(undefined, event.reporterData?.[r.name]);
      try {
        await r.track(event.event, cloneDeep(event.data), reporterCtx);
      } catch (err) {
        this.handleError(err as Error, r.name, event.event, event.data, reporterCtx?.privateData);
      }
    });
  }

  async sendBatch(
    batch: DispatchEvent[] | TrackEvent[],
    reporters?: Reporter[],
    ctx?: ReporterContext
  ): Promise<void> {
    const targets = reporters ?? this.reporters;
    for (const reporter of targets) {
      if (reporter.batchTrack) {
        await reporter.batchTrack(
          batch.map((item) => ({
            event: item.event,
            data: cloneDeep(item.data),
            timestamp: item.timestamp,
            privateData: this.getBatchItemPrivateData(item, reporter.name),
          })),
          ctx
        );
      } else {
        for (const item of batch) {
          const privateData = this.getBatchItemPrivateData(item, reporter.name);
          await reporter.track(
            item.event,
            cloneDeep(item.data),
            this.createReporterContext(ctx, privateData)
          );
        }
      }
    }
  }

  private handleError(
    err: Error,
    reporter: string,
    event: string,
    data: Record<string, any>,
    privateData?: Record<string, any>
  ): void {
    this.options.onError?.(err, reporter, event, data);

    if (this.options.retry) {
      this.failedQueue.push({
        reporter,
        event,
        data: cloneDeep(data),
        privateData: privateData ? cloneDeep(privateData) : undefined,
        retries: 0,
      });
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
        Promise.resolve(
          r.track(
            item.event,
            cloneDeep(item.data),
            this.createReporterContext(undefined, item.privateData)
          )
        ).catch(() => {
          this.failedQueue.push({ ...item, retries: item.retries + 1 });
          this.scheduleRetry();
        });
      }
    }, delay);
  }

  private createDispatchEvent(
    event: string,
    data: Record<string, any>,
    reporters: Reporter[],
    reporterData?: ReporterDataMap
  ): DispatchEvent {
    return {
      event,
      data: cloneDeep(data),
      timestamp: Date.now(),
      reporters: reporters.map((reporter) => reporter.name),
      reporterData: this.resolveReporterData(reporters, reporterData),
    };
  }

  private resolveReporterData(
    reporters: Reporter[],
    reporterData?: ReporterDataMap
  ): ReporterDataMap | undefined {
    const result: ReporterDataMap = {};
    let hasData = false;

    for (const reporter of reporters) {
      const privateData = this.resolveReporterPrivateData(
        reporter.name,
        reporterData?.[reporter.name]
      );
      if (privateData) {
        result[reporter.name] = privateData;
        hasData = true;
      }
    }

    return hasData ? result : undefined;
  }

  private resolveReporterPrivateData(
    reporterName: string,
    eventData?: Record<string, any>
  ): Record<string, any> | undefined {
    const merged: Record<string, any> = {};
    let hasData = false;
    const providers = this.reporterDataProviders.get(reporterName) ?? [];

    for (const provider of providers) {
      const value = typeof provider === 'function' ? provider() : provider;
      if (value && typeof value === 'object') {
        Object.assign(merged, cloneDeep(value));
        hasData = true;
      }
    }

    if (eventData && typeof eventData === 'object') {
      Object.assign(merged, cloneDeep(eventData));
      hasData = true;
    }

    return hasData ? merged : undefined;
  }

  private getBatchItemPrivateData(
    item: DispatchEvent | TrackEvent,
    reporterName: string
  ): Record<string, any> | undefined {
    if (this.isDispatchEvent(item)) {
      const privateData = item.reporterData?.[reporterName];
      return privateData ? cloneDeep(privateData) : undefined;
    }

    return item.privateData ? cloneDeep(item.privateData) : undefined;
  }

  private isDispatchEvent(item: DispatchEvent | TrackEvent): item is DispatchEvent {
    return 'reporterData' in item || 'reporters' in item;
  }

  private upsertReporter(reporter: Reporter): void {
    const idx = this.reporters.findIndex((item) => item.name === reporter.name);
    reporter.init?.();

    if (idx === -1) {
      this.reporters.push(reporter);
      return;
    }

    this.reporters[idx].destroy?.();
    this.reporters[idx] = reporter;
  }

  private createReporterContext(
    baseContext?: ReporterContext,
    privateData?: Record<string, any>
  ): ReporterContext | undefined {
    const ctx: ReporterContext = { ...(baseContext ?? {}) };
    if (privateData) {
      ctx.privateData = cloneDeep(privateData);
    }
    return Object.keys(ctx).length ? ctx : undefined;
  }

  destroy(): void {
    this.reporters.forEach((r) => {
      r.destroy?.();
    });
    this.reporters = [];
    this.middlewares = [];
    this.reporterDataProviders.clear();
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
