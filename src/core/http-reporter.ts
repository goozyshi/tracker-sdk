import { type TransportChannel, transport } from './transport';
import type { Reporter, TrackEvent } from './types';

export interface HttpReporterOptions {
  name: string;
  url: string;
  endpoints?: Partial<Record<TransportChannel, string>>;
  transport?: TransportChannel[];
  transform?: (event: string, data: Record<string, any>) => unknown;
  batchTransform?: (events: TrackEvent[]) => unknown;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  timeout?: number;
  method?: 'POST' | 'GET';
}

const DEFAULT_CHANNELS: TransportChannel[] = ['beacon', 'fetch', 'image', 'xhr'];

export function createHttpReporter(options: HttpReporterOptions): Reporter {
  const {
    name,
    url,
    endpoints,
    transport: channels = DEFAULT_CHANNELS,
    transform,
    batchTransform,
    headers,
    credentials,
    timeout,
    method,
  } = options;

  const resolveUrl = (ch: TransportChannel): string => endpoints?.[ch] ?? url;
  const baseReq = { headers, credentials, timeout, method };

  return {
    name,
    async track(event, data, ctx) {
      const body = transform ? transform(event, data ?? {}) : { event, data: data ?? {} };
      await transport(
        (ch) => ({ ...baseReq, url: resolveUrl(ch), body }),
        channels,
        ctx?.sync ?? false
      );
    },
    async batchTrack(events, ctx) {
      const body = batchTransform ? batchTransform(events) : { events };
      await transport(
        (ch) => ({ ...baseReq, url: resolveUrl(ch), body }),
        channels,
        ctx?.sync ?? false
      );
    },
  };
}
