export interface TrackEvent {
  event: string;
  data: Record<string, any>;
  timestamp: number;
}

export interface ReporterContext {
  sync?: boolean;
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

export interface TrackerOptions {
  onError?: (err: Error, reporter: string, event: string, data: any) => void;
  retry?: { max: number; delay: number };
  defaultReporters?: string[];
  batch?: BatchOptions;
  offline?: OfflineOptions;
}

export interface SendEventOptions {
  reporters?: string[];
}

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
