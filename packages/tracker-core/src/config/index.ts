import type {
  ResolvedConfig,
  TrackerConfig,
  TrackerErrorHandler,
  TrackerErrorScope,
} from '../types/config';
import type { ReporterRegistry } from '../types/reporter';

const DEFAULT_LIB_VERSION = '0.0.1';

const DEFAULT_PROVIDER_TIMEOUT = 3000;
const DEFAULT_SESSION_TIMEOUT = 30 * 60 * 1000;
const DEFAULT_FLUSH_INTERVAL = 6000;
const DEFAULT_FLUSH_BATCH_SIZE = 6;
const DEFAULT_MAX_BATCH_BYTES = 64 * 1024;
const DEFAULT_MAX_OFFLINE_SIZE = 200;
const DEFAULT_MAX_OFFLINE_AGE = 7 * 24 * 60 * 60;
const DEFAULT_RETRY_MAX = 4;
const DEFAULT_RETRY_BASE_DELAY = 1000;
const DEFAULT_PREQUEUE_MAX_SIZE = 100;

const DEFAULT_SANITIZE_BLACKLIST = ['phone', 'mobile', 'id_card', 'idCard', 'email', 'bank_card'];
const DEFAULT_TRIM = {
  maxDepth: 5,
  maxStringLength: 8 * 1024,
  maxArrayLength: 100,
  maxObjectKeys: 100,
};

const DEFAULT_KEY_PREFIX = 'tracker';

const noopErrorHandler: TrackerErrorHandler = () => {};

export function createConfig(input: TrackerConfig): ResolvedConfig {
  validate(input);

  const idm = input.idm ?? {};
  const session = input.session ?? {};
  const pipeline = input.pipeline ?? {};
  const queue = input.queue ?? {};
  const retry = input.retry ?? {};
  const prequeue = input.prequeue ?? {};

  const { reporters, defaultReporters } = resolveReporters(input);

  return {
    appId: input.appId,
    libVersion: input.libVersion ?? DEFAULT_LIB_VERSION,
    reporters,
    defaultReporters,
    idm: {
      userIdProvider: idm.userIdProvider ?? null,
      superPropertiesProvider: idm.superPropertiesProvider ?? null,
      providerTimeout: idm.providerTimeout ?? DEFAULT_PROVIDER_TIMEOUT,
      storageKeyPrefix: idm.storageKeyPrefix ?? DEFAULT_KEY_PREFIX,
    },
    session: {
      sessionTimeout: session.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT,
      storageKeyPrefix: session.storageKeyPrefix ?? DEFAULT_KEY_PREFIX,
    },
    pipeline: {
      sampleRate: pipeline.sampleRate ?? 1,
      sanitizeFieldBlacklist: pipeline.sanitizeFieldBlacklist ?? DEFAULT_SANITIZE_BLACKLIST,
      trim: { ...DEFAULT_TRIM, ...(pipeline.trim ?? {}) },
    },
    queue: {
      flushInterval: queue.flushInterval ?? DEFAULT_FLUSH_INTERVAL,
      flushBatchSize: queue.flushBatchSize ?? DEFAULT_FLUSH_BATCH_SIZE,
      maxBatchBytes: queue.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES,
      maxOfflineSize: queue.maxOfflineSize ?? DEFAULT_MAX_OFFLINE_SIZE,
      maxOfflineAge: queue.maxOfflineAge ?? DEFAULT_MAX_OFFLINE_AGE,
      flushOnUnload: queue.flushOnUnload ?? true,
      storageKeyPrefix: queue.storageKeyPrefix ?? DEFAULT_KEY_PREFIX,
    },
    retry: {
      max: retry.max ?? DEFAULT_RETRY_MAX,
      baseDelay: retry.baseDelay ?? DEFAULT_RETRY_BASE_DELAY,
    },
    prequeue: {
      maxSize: resolvePrequeueMaxSize(prequeue.maxSize),
    },
    superProperties: input.superProperties ?? {},
    onError: input.onError ?? noopErrorHandler,
    debug: input.debug ?? false,
  };
}

function resolveReporters(input: TrackerConfig): {
  reporters: ReporterRegistry;
  defaultReporters: string[];
} {
  if (input.reporter && input.reporters) {
    throw configError(
      'config_invalid',
      'config.reporter and config.reporters are mutually exclusive'
    );
  }

  let reporters: ReporterRegistry;
  if (input.reporter) {
    reporters = { default: input.reporter };
  } else if (input.reporters) {
    reporters = { ...input.reporters };
  } else {
    reporters = {};
  }

  for (const [name, reporter] of Object.entries(reporters)) {
    if (!reporter || typeof reporter.send !== 'function') {
      throw configError('config_invalid', `config.reporters.${name} must implement Reporter.send`);
    }
  }

  const defaultReporters =
    input.defaultReporters && input.defaultReporters.length > 0
      ? [...input.defaultReporters]
      : ['default'];

  if (defaultReporters.some((n) => typeof n !== 'string' || !n)) {
    throw configError('config_invalid', 'config.defaultReporters must be non-empty strings');
  }

  return { reporters, defaultReporters };
}

function validate(input: TrackerConfig): void {
  if (!input || typeof input !== 'object') {
    throw configError('config_invalid', 'TrackerConfig must be an object');
  }
  if (!input.appId || typeof input.appId !== 'string') {
    throw configError('config_invalid', 'config.appId is required (string)');
  }
  if (input.reporter && typeof input.reporter.send !== 'function') {
    throw configError('config_invalid', 'config.reporter must implement Reporter.send');
  }
  if (input.idm?.userIdProvider != null && typeof input.idm.userIdProvider !== 'function') {
    throw configError('config_invalid', 'config.idm.userIdProvider must be a function');
  }
  if (
    input.idm?.superPropertiesProvider != null &&
    typeof input.idm.superPropertiesProvider !== 'function'
  ) {
    throw configError('config_invalid', 'config.idm.superPropertiesProvider must be a function');
  }
  if (
    input.pipeline?.sampleRate != null &&
    (typeof input.pipeline.sampleRate !== 'number' ||
      input.pipeline.sampleRate < 0 ||
      input.pipeline.sampleRate > 1)
  ) {
    throw configError('config_invalid', 'config.pipeline.sampleRate must be in [0,1]');
  }
}

function resolvePrequeueMaxSize(value: number | undefined): number {
  if (value == null) return DEFAULT_PREQUEUE_MAX_SIZE;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw configError(
      'config_invalid',
      'config.prequeue.maxSize must be a positive integer'
    );
  }
  return value;
}

function configError(scope: TrackerErrorScope, message: string): Error {
  const err = new Error(message);
  (err as Error & { scope: TrackerErrorScope }).scope = scope;
  return err;
}
