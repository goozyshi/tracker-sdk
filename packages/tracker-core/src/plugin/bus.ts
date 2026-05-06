import type { TrackerErrorHandler } from '../types/config';
import type { EventEnvelope, RawEvent } from '../types/event';
import type { Plugin, PluginContext } from '../types/plugin';
import type { BeforeSendContext, ReporterResult } from '../types/reporter';

export interface PluginBusOptions {
  onError: TrackerErrorHandler;
}

export class PluginBus {
  private plugins: Plugin[] = [];
  private onError: TrackerErrorHandler;

  constructor(options: PluginBusOptions) {
    this.onError = options.onError;
  }

  use(plugin: Plugin): void {
    if (this.plugins.some((p) => p.name === plugin.name)) return;
    this.plugins.push(plugin);
  }

  init(ctx: PluginContext): void {
    for (const plugin of this.plugins) {
      try {
        plugin.init?.(ctx);
      } catch (err) {
        this.onError(err as Error, 'plugin_error', { plugin: plugin.name, hook: 'init' });
      }
    }
  }

  beforeProcess(raw: RawEvent): RawEvent | null {
    let current: RawEvent | null = raw;
    for (const plugin of this.plugins) {
      if (!current) return null;
      if (!plugin.beforeProcess) continue;
      try {
        current = plugin.beforeProcess(current);
      } catch (err) {
        this.onError(err as Error, 'plugin_error', { plugin: plugin.name, hook: 'beforeProcess' });
      }
    }
    return current;
  }

  beforeSend(batch: EventEnvelope[], ctx: BeforeSendContext): EventEnvelope[] {
    let current = batch;
    for (const plugin of this.plugins) {
      if (!plugin.beforeSend) continue;
      try {
        const next = plugin.beforeSend(current, ctx);
        if (Array.isArray(next)) current = next;
      } catch (err) {
        this.onError(err as Error, 'plugin_error', {
          plugin: plugin.name,
          hook: 'beforeSend',
          reporterName: ctx.reporterName,
        });
      }
    }
    return current;
  }

  afterSend(batch: EventEnvelope[], result: ReporterResult, ctx: BeforeSendContext): void {
    for (const plugin of this.plugins) {
      if (!plugin.afterSend) continue;
      try {
        plugin.afterSend(batch, result, ctx);
      } catch (err) {
        this.onError(err as Error, 'plugin_error', {
          plugin: plugin.name,
          hook: 'afterSend',
          reporterName: ctx.reporterName,
        });
      }
    }
  }

  destroy(): void {
    this.plugins = [];
  }
}
