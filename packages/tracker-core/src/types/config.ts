import type { JSONObject } from "@goozyshi/tracker-shared";
import type { Reporter, ReporterRegistry } from "./reporter";

export interface IDMUserIdResult {
  userId: string | null;
}

export type UserIdProvider = () => Promise<IDMUserIdResult> | IDMUserIdResult;
export type SuperPropertiesProvider = () => Promise<JSONObject> | JSONObject;

export interface IDMConfig {
  userIdProvider?: UserIdProvider;
  superPropertiesProvider?: SuperPropertiesProvider;
  providerTimeout?: number;
  storageKeyPrefix?: string;
}

export interface SessionConfig {
  sessionTimeout?: number;
  storageKeyPrefix?: string;
}

export interface PipelineTrimConfig {
  maxDepth?: number;
  maxStringLength?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
}

export interface PipelineConfig {
  sampleRate?: number;
  sanitizeFieldBlacklist?: string[];
  trim?: PipelineTrimConfig;
}

export interface QueueConfig {
  flushInterval?: number;
  flushBatchSize?: number;
  maxBatchBytes?: number;
  maxOfflineSize?: number;
  maxOfflineAge?: number;
  flushOnUnload?: boolean;
  storageKeyPrefix?: string;
}

export interface RetryConfig {
  max?: number;
  baseDelay?: number;
}

export interface PrequeueConfig {
  maxSize?: number;
}

export type TrackerErrorScope =
  | "storage_unavailable"
  | "storage_full"
  | "reporter_failed"
  | "reporter_missing"
  | "route_invalid"
  | "no_reporter_registered"
  | "pipeline_error"
  | "plugin_error"
  | "identify_blocked"
  | "provider_failed"
  | "reporter_data_provider_failed"
  | "prequeue_overflow"
  | "config_invalid";

export type TrackerErrorHandler = (
  err: Error,
  scope: TrackerErrorScope,
  meta?: Record<string, unknown>
) => void;

export interface TrackerConfig {
  appId: string;
  libVersion?: string;
  reporter?: Reporter;
  reporters?: ReporterRegistry;
  defaultReporters?: string[];
  idm?: IDMConfig;
  session?: SessionConfig;
  pipeline?: PipelineConfig;
  queue?: QueueConfig;
  retry?: RetryConfig;
  prequeue?: PrequeueConfig;
  superProperties?: JSONObject;
  onError?: TrackerErrorHandler;
  debug?: boolean;
}

export interface ResolvedIDMConfig {
  userIdProvider: UserIdProvider | null;
  superPropertiesProvider: SuperPropertiesProvider | null;
  providerTimeout: number;
  storageKeyPrefix: string;
}

export interface ResolvedSessionConfig {
  sessionTimeout: number;
  storageKeyPrefix: string;
}

export interface ResolvedPipelineConfig {
  sampleRate: number;
  sanitizeFieldBlacklist: string[];
  trim: Required<PipelineTrimConfig>;
}

export interface ResolvedQueueConfig {
  flushInterval: number;
  flushBatchSize: number;
  maxBatchBytes: number;
  maxOfflineSize: number;
  maxOfflineAge: number;
  flushOnUnload: boolean;
  storageKeyPrefix: string;
}

export interface ResolvedRetryConfig {
  max: number;
  baseDelay: number;
}

export interface ResolvedPrequeueConfig {
  maxSize: number;
}

export interface ResolvedConfig {
  appId: string;
  libVersion: string;
  reporters: ReporterRegistry;
  defaultReporters: string[];
  idm: ResolvedIDMConfig;
  session: ResolvedSessionConfig;
  pipeline: ResolvedPipelineConfig;
  queue: ResolvedQueueConfig;
  retry: ResolvedRetryConfig;
  prequeue: ResolvedPrequeueConfig;
  superProperties: JSONObject;
  onError: TrackerErrorHandler;
  debug: boolean;
}
