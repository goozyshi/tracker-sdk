import type { TrackReportersSpec } from "@goozyshi/tracker-core";
import type { JSONObject } from "@goozyshi/tracker-shared";

export type UnbindFn = () => void;

export interface ClickOptions {
  debounce?: number;
  throttle?: number;
  reporters?: TrackReportersSpec;
}

export interface ExposureOptions {
  threshold?: number;
  duration?: number;
  once?: boolean;
  groupKey?: string;
  groupDelay?: number;
  reporters?: TrackReportersSpec;
}

export type DOMEventProperties = JSONObject | undefined;
