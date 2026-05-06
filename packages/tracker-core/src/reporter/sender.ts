import type { PluginBus } from '../plugin/bus';
import type { OfflineManager } from '../queue/offline';
import { withRetry } from '../transport/retry';
import type { ResolvedRetryConfig, TrackerErrorHandler } from '../types/config';
import type { EventEnvelope } from '../types/event';
import type {
  Reporter,
  ReporterRegistry,
  ReporterResult,
  ReporterSendOptions,
} from '../types/reporter';

export const BATCH_KIND_EVENT = 'event';

export function makeBatchKey(reporterName: string): string {
  return `${reporterName}:${BATCH_KIND_EVENT}`;
}

export function parseBatchKey(batchKey: string): { reporterName: string; kind: string } | null {
  const idx = batchKey.indexOf(':');
  if (idx <= 0) return null;
  return {
    reporterName: batchKey.slice(0, idx),
    kind: batchKey.slice(idx + 1),
  };
}

export interface SenderOptions {
  reporters: ReporterRegistry;
  pluginBus: PluginBus;
  offline: OfflineManager;
  retry: ResolvedRetryConfig;
  onError: TrackerErrorHandler;
}

export class Sender {
  private reporters: ReporterRegistry;
  private pluginBus: PluginBus;
  private offline: OfflineManager;
  private retry: ResolvedRetryConfig;
  private onError: TrackerErrorHandler;

  constructor(options: SenderOptions) {
    this.reporters = options.reporters;
    this.pluginBus = options.pluginBus;
    this.offline = options.offline;
    this.retry = options.retry;
    this.onError = options.onError;
  }

  async send(
    batchKey: string,
    envelopes: EventEnvelope[],
    options: ReporterSendOptions = {}
  ): Promise<ReporterResult> {
    const parsed = parseBatchKey(batchKey);
    if (!parsed) {
      const error = new Error(`invalid batchKey: ${batchKey}`);
      this.onError(error, 'route_invalid', { batchKey });
      return { ok: false, error };
    }

    const reporter: Reporter | undefined = this.reporters[parsed.reporterName];
    if (!reporter) {
      const error = new Error(`reporter not registered: ${parsed.reporterName}`);
      this.onError(error, 'reporter_missing', { batchKey, reporterName: parsed.reporterName });
      this.offline.save(batchKey, envelopes);
      return { ok: false, error };
    }

    const ctx = { reporterName: parsed.reporterName };
    const prepared = this.pluginBus.beforeSend(envelopes, ctx);
    if (!prepared.length) return { ok: true };

    let result: ReporterResult;
    try {
      result = await withRetry(() => reporter.send(prepared, options), this.retry);
      if (!result.ok && result.error) throw result.error;
    } catch (err) {
      const error = err as Error;
      result = { ok: false, error };
      this.offline.save(batchKey, prepared);
      this.onError(error, 'reporter_failed', {
        batchKey,
        reporterName: parsed.reporterName,
        count: prepared.length,
      });
    }

    this.pluginBus.afterSend(prepared, result, ctx);
    return result;
  }
}
