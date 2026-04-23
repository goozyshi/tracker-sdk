export { sendEvent } from './core/api';
export { clickManager } from './core/click';
export { exposureManager } from './core/exposure';
export type { HttpReporterOptions } from './core/http-reporter';
export { createHttpReporter } from './core/http-reporter';
export { createTracker, Tracker, tracker } from './core/tracker';
export type { TransportChannel, TransportRequest } from './core/transport';

export type {
  BatchOptions,
  ClickOptions,
  DataProvider,
  EventName,
  EventRegistry,
  ExposureOptions,
  FilterFn,
  Middleware,
  MiddlewareContext,
  OfflineOptions,
  Reporter,
  ReporterContext,
  SendEventOptions,
  TrackEvent,
  TrackerOptions,
  TransformFn,
  UnbindFn,
} from './core/types';
