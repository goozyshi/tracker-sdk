import {
  createTracker as createCoreTracker,
  type Plugin,
  type Tracker,
  type TrackerConfig,
} from "@goozyshi/tracker-core";

export interface CreateTrackerPresetOptions extends TrackerConfig {
  plugins?: Plugin[];
  autoInit?: boolean;
}

export function createTracker(options: CreateTrackerPresetOptions): Tracker {
  const { plugins, autoInit, ...config } = options;
  const tracker = createCoreTracker(config);
  if (plugins) for (const p of plugins) tracker.use(p);
  if (autoInit !== false) void tracker.init();
  return tracker;
}

export * from "@goozyshi/tracker-core";
export type {
  JSONArray,
  JSONObject,
  JSONPrimitive,
  JSONValue,
} from "@goozyshi/tracker-shared";
export { ClickManager } from "./dom/click";
export { ExposureManager } from "./dom/exposure";
export type {
  ClickOptions,
  DOMEventProperties,
  ExposureOptions,
  UnbindFn,
} from "./dom/types";
export type {
  HttpReporterBody,
  HttpReporterOptions,
  HttpReporterUrl,
} from "./http-reporter";
export { createHttpReporter } from "./http-reporter";
export { createPolarisReporter } from "./reporter-polaris/polaris";
export type {
  PolarisEnv,
  PolarisEventItem,
  PolarisPayload,
  PolarisPublicInfo,
  PolarisReporterOptions,
} from "./reporter-polaris/types";
export type { InstallStubOptions, TrackerStub } from "./stub";
export { installStub, STUB_SNIPPET } from "./stub";
