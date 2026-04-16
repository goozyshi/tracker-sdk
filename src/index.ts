export { Tracker, createTracker, tracker } from './core/tracker';
export { sendEvent } from './core/api';
export { exposureManager } from './core/exposure';
export { clickManager } from './core/click';

export type {
  Reporter,
  Middleware,
  MiddlewareContext,
  DataProvider,
  TrackerOptions,
  TrackEvent,
  ExposureOptions,
  ClickOptions,
  BatchOptions,
  OfflineOptions,
  SendEventOptions,
  UnbindFn,
  TransformFn,
  FilterFn,
  EventRegistry,
  EventName,
} from './core/types';
