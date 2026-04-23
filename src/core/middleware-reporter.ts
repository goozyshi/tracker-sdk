import { type TransportChannel, transport } from './transport';
import type {
  MiddlewareReporterEnv,
  MiddlewareReporterOptions,
  Reporter,
  ReporterContext,
  ReporterPrivateData,
  TrackEvent,
} from './types';
import { cloneDeep } from './utils';

const MIDDLEWARE_REPORTER_NAME = 'middleware';
const MIDDLEWARE_URLS: Partial<Record<MiddlewareReporterEnv, string>> = {
  test: '/h5/event',
};
const DEFAULT_CHANNELS: TransportChannel[] = ['image', 'fetch', 'beacon', 'xhr'];

interface MiddlewarePayload {
  biz: string;
  public_info: Record<string, any>;
  events: Array<{
    event_name: string;
    client_timestamp: number;
    extra: Record<string, any>;
  }>;
}

interface MiddlewarePrivateDataParts {
  publicInfo: Record<string, any>;
  extra: Record<string, any>;
}

export function createMiddlewareReporter(options: MiddlewareReporterOptions): Reporter {
  validateMiddlewareReporterOptions(options);

  const url = resolveMiddlewareReporterUrl(options);
  const channels = options.transport ?? DEFAULT_CHANNELS;
  const baseReq = {
    headers: options.headers,
    credentials: options.credentials,
    timeout: options.timeout,
    method: options.method,
  };

  return {
    name: MIDDLEWARE_REPORTER_NAME,
    async track(event, data, ctx) {
      const payload = buildSinglePayload(options, event, data ?? {}, ctx);
      validateMiddlewarePayload(payload);
      await transport(
        (channel) => ({
          ...baseReq,
          url: options.endpoints?.[channel] ?? url,
          body: payload,
        }),
        channels,
        ctx?.sync ?? false
      );
    },
    async batchTrack(events, ctx) {
      if (!events.length) return;
      const payload = buildBatchPayload(options, events);
      validateMiddlewarePayload(payload);
      await transport(
        (channel) => ({
          ...baseReq,
          url: options.endpoints?.[channel] ?? url,
          body: payload,
        }),
        channels,
        ctx?.sync ?? false
      );
    },
  };
}

function buildSinglePayload(
  options: MiddlewareReporterOptions,
  event: string,
  data: Record<string, any>,
  ctx?: ReporterContext
): MiddlewarePayload {
  const privateData = splitPrivateData(ctx?.privateData);

  return {
    biz: options.biz,
    public_info: {
      ...resolvePublicInfo(options.publicInfo),
      ...privateData.publicInfo,
    },
    events: [
      {
        event_name: event,
        client_timestamp: Date.now(),
        extra: {
          ...cloneDeep(data),
          ...privateData.extra,
        },
      },
    ],
  };
}

function buildBatchPayload(
  options: MiddlewareReporterOptions,
  events: TrackEvent[]
): MiddlewarePayload {
  const publicInfo = resolvePublicInfo(options.publicInfo);
  const list = events.map((item) => {
    const privateData = splitPrivateData(item.privateData);
    Object.assign(publicInfo, privateData.publicInfo);
    return {
      event_name: item.event,
      client_timestamp: item.timestamp,
      extra: {
        ...cloneDeep(item.data),
        ...privateData.extra,
      },
    };
  });

  return {
    biz: options.biz,
    public_info: publicInfo,
    events: list,
  };
}

function resolveMiddlewareReporterUrl(options: MiddlewareReporterOptions): string {
  const env = options.env ?? 'test';
  const url = MIDDLEWARE_URLS[env];
  if (url) return url;
  throw new Error(`middlewareReporter env=${env} is not available in this SDK version`);
}

function resolvePublicInfo(
  provider?: MiddlewareReporterOptions['publicInfo']
): Record<string, any> {
  if (!provider) return {};
  const value = typeof provider === 'function' ? provider() : provider;
  if (value == null) return {};
  return asPlainRecord(value, 'middlewareReporter.publicInfo');
}

function splitPrivateData(privateData?: ReporterPrivateData): MiddlewarePrivateDataParts {
  if (privateData == null) {
    return { publicInfo: {}, extra: {} };
  }

  const raw = asPlainRecord(privateData, 'middleware reporter privateData');
  const { publicInfo, ...extra } = raw;

  return {
    publicInfo:
      publicInfo == null
        ? {}
        : asPlainRecord(publicInfo, 'middleware reporter privateData.publicInfo'),
    extra: cloneDeep(extra),
  };
}

function validateMiddlewareReporterOptions(options: MiddlewareReporterOptions): void {
  if (!options.biz || typeof options.biz !== 'string') {
    throw new Error('middlewareReporter.biz is required');
  }

  if (options.transport) {
    const invalid = options.transport.filter((channel) => !DEFAULT_CHANNELS.includes(channel));
    if (invalid.length) {
      throw new Error(
        `middlewareReporter.transport contains invalid channels: ${invalid.join(', ')}`
      );
    }
  }

  if (options.publicInfo) {
    resolvePublicInfo(options.publicInfo);
  }

  resolveMiddlewareReporterUrl(options);
}

function validateMiddlewarePayload(payload: MiddlewarePayload): void {
  if (!payload.biz || typeof payload.biz !== 'string') {
    throw new Error('middleware reporter payload.biz must be a string');
  }

  asPlainRecord(payload.public_info, 'middleware reporter payload.public_info');

  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    throw new Error('middleware reporter payload.events must be a non-empty array');
  }

  payload.events.forEach((item, index) => {
    if (!item.event_name || typeof item.event_name !== 'string') {
      throw new Error(`middleware reporter payload.events[${index}].event_name must be a string`);
    }

    if (!Number.isFinite(item.client_timestamp)) {
      throw new Error(
        `middleware reporter payload.events[${index}].client_timestamp must be a number`
      );
    }

    asPlainRecord(item.extra, `middleware reporter payload.events[${index}].extra`);
  });
}

function asPlainRecord(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return cloneDeep(value as Record<string, any>);
}
