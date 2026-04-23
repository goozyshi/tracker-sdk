import type { TransportChannel } from './transport';

export interface TrackEvent {
  event: string;
  data: Record<string, any>;
  timestamp: number;
  privateData?: ReporterPrivateData;
}

export type ReporterPrivateData = Record<string, any>;

export type ReporterDataMap = Record<string, ReporterPrivateData>;

export interface DispatchEvent {
  event: string;
  data: Record<string, any>;
  timestamp: number;
  reporters?: string[];
  reporterData?: ReporterDataMap;
}

export interface ReporterContext {
  sync?: boolean;
  privateData?: ReporterPrivateData;
}

export interface Reporter {
  name: string;
  track: (event: string, data?: Record<string, any>, ctx?: ReporterContext) => void | Promise<void>;
  batchTrack?: (events: TrackEvent[], ctx?: ReporterContext) => void | Promise<void>;
  init?: () => void;
  destroy?: () => void;
}

export interface MiddlewareContext {
  event: string;
  data: Record<string, any>;
}

export type Middleware = (ctx: MiddlewareContext, next: () => void) => void;

export type DataProvider = Record<string, any> | (() => Record<string, any>);

export interface BatchOptions {
  enabled?: boolean;
  maxSize?: number;
  interval?: number;
  flushOnUnload?: boolean;
}

export interface OfflineOptions {
  enabled?: boolean;
  storage?: 'localStorage' | 'indexedDB';
  maxSize?: number;
  maxAge?: number;
}

export type MiddlewareReporterEnv = 'test' | 'prod';

export interface MiddlewareReporterOptions {
  biz: string;
  env?: MiddlewareReporterEnv;
  endpoints?: Partial<Record<TransportChannel, string>>;
  publicInfo?: DataProvider;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  timeout?: number;
  transport?: TransportChannel[];
  method?: 'POST' | 'GET';
}

export interface TrackerOptions {
  onError?: (err: Error, reporter: string, event: string, data: any) => void;
  retry?: { max: number; delay: number };
  defaultReporters?: string[];
  batch?: BatchOptions;
  offline?: OfflineOptions;
  middlewareReporter?: MiddlewareReporterOptions;
}

export interface TrackOptions {
  reporters?: string[];
  reporterData?: ReporterDataMap;
}

export interface SendEventOptions extends TrackOptions {}

export interface ExposureOptions {
  threshold?: number;
  duration?: number;
  once?: boolean;
  groupKey?: string;
  groupDelay?: number;
}

export interface ClickOptions {
  debounce?: number;
  throttle?: number;
}

export type UnbindFn = () => void;
// biome-ignore lint/suspicious/noEmptyInterface: intentional for module augmentation
export interface EventRegistry {}

export type EventName = keyof EventRegistry extends never ? string : keyof EventRegistry;

export type TransformFn = (data: Record<string, any>) => Record<string, any>;

export type FilterFn = (event: string, data: Record<string, any>) => boolean;
