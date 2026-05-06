import { cloneDeep, type JSONObject } from "@goozyshi/tracker-shared";
import { createConfig } from "./config/index";
import { bootstrapIDM } from "./idm/bootstrap";
import { IDM } from "./idm/idm";
import { Lifecycle } from "./lifecycle/ready";
import { Pipeline } from "./pipeline/pipeline";
import { PluginBus } from "./plugin/bus";
import { BucketedQueue } from "./queue/bucketed-queue";
import { OfflineManager } from "./queue/offline";
import { makeBatchKey, Sender } from "./reporter/sender";
import { createPresetsReader } from "./runtime/presets";
import { SessionManager } from "./session/session";
import type { KVStorage } from "./storage/index";
import { createLocalStorage, createMemoryStorage } from "./storage/index";
import type { ResolvedConfig, TrackerConfig } from "./types/config";
import type {
  EventEnvelope,
  EventIdentity,
  RawEvent,
  TrackOptions,
} from "./types/event";
import type { Plugin, PluginContext } from "./types/plugin";
import type { Reporter, ReporterRegistry } from "./types/reporter";

const LIB_NAME = "web";

interface PrequeueItem {
  event: string;
  properties: JSONObject;
  options?: TrackOptions;
  time: number;
}

export class Tracker {
  private config: ResolvedConfig;
  private storage: KVStorage;
  private superProperties: JSONObject;
  private reporters: ReporterRegistry;
  private defaultReporters: string[];
  private reporterDataProviders = new Map<string, () => JSONObject>();
  private idm: IDM;
  private session: SessionManager;
  private pipeline: Pipeline;
  private pluginBus: PluginBus;
  private offline: OfflineManager;
  private sender: Sender;
  private queue: BucketedQueue;
  private lifecycle: Lifecycle;
  private prequeue: PrequeueItem[] = [];
  private offIdentitySync: (() => void) | null = null;
  private destroyed = false;
  private initialized = false;

  constructor(input: TrackerConfig) {
    this.config = createConfig(input);
    this.storage = pickStorage(this.config.onError);
    this.superProperties = { ...this.config.superProperties };
    this.reporters = { ...this.config.reporters };
    this.defaultReporters = [...this.config.defaultReporters];

    this.idm = new IDM({
      storage: this.storage,
      storageKeyPrefix: this.config.idm.storageKeyPrefix,
    });
    this.session = new SessionManager({
      storage: this.storage,
      storageKeyPrefix: this.config.session.storageKeyPrefix,
      sessionTimeout: this.config.session.sessionTimeout,
    });

    const presetsReader = createPresetsReader();

    this.pipeline = new Pipeline({
      presetsReader,
      superPropertiesGetter: () => this.superProperties,
      identityGetter: (): EventIdentity => ({
        anonymousId: this.idm.getAnonymousId(),
        userId: this.idm.getUserId(),
        sessionId: this.session.getSessionId(),
      }),
      app: {
        appId: this.config.appId,
        lib: { name: LIB_NAME, version: this.config.libVersion },
      },
      config: this.config.pipeline,
    });

    this.pluginBus = new PluginBus({ onError: this.config.onError });
    this.offline = new OfflineManager({
      storage: this.storage,
      storageKeyPrefix: this.config.queue.storageKeyPrefix,
      maxSize: this.config.queue.maxOfflineSize,
      maxAgeSeconds: this.config.queue.maxOfflineAge,
      onError: this.config.onError,
    });
    this.sender = new Sender({
      reporters: this.reporters,
      pluginBus: this.pluginBus,
      offline: this.offline,
      retry: this.config.retry,
      onError: this.config.onError,
    });
    this.queue = new BucketedQueue({
      sender: this.sender,
      offline: this.offline,
      config: this.config.queue,
    });
    this.lifecycle = new Lifecycle();

    this.offIdentitySync = this.idm.onChange((event) => {
      if (event.reason === "identify" || event.reason === "reset") {
        this.session.rotate("identity_change");
      }
    });
  }

  use(plugin: Plugin): this {
    if (this.destroyed) return this;
    this.pluginBus.use(plugin);
    if (this.initialized) {
      this.runPluginInit(plugin);
    }
    return this;
  }

  addReporter(name: string, reporter: Reporter): this {
    if (this.destroyed) return this;
    if (!name || typeof name !== "string") {
      this.config.onError(
        new Error("reporter name must be non-empty string"),
        "config_invalid"
      );
      return this;
    }
    if (!reporter || typeof reporter.send !== "function") {
      this.config.onError(
        new Error(`reporter "${name}" must implement Reporter.send`),
        "config_invalid"
      );
      return this;
    }
    if (this.reporters[name]) {
      this.config.onError(
        new Error(`reporter "${name}" already registered`),
        "config_invalid",
        {
          reporterName: name,
        }
      );
      return this;
    }
    this.reporters[name] = reporter;
    return this;
  }

  setReporterData(name: string, provider: () => JSONObject): this {
    if (this.destroyed) return this;
    if (!name || typeof name !== "string") {
      this.config.onError(
        new Error("reporter data provider name must be non-empty string"),
        "config_invalid"
      );
      return this;
    }
    if (typeof provider !== "function") {
      this.config.onError(
        new Error(`reporter data provider for "${name}" must be a function`),
        "config_invalid",
        { reporterName: name }
      );
      return this;
    }
    this.reporterDataProviders.set(name, provider);
    return this;
  }

  async init(): Promise<this> {
    if (this.destroyed || this.initialized) return this;
    this.initialized = true;

    this.queue.start();

    const ctx: PluginContext = {
      tracker: {
        onReady: (cb) => this.lifecycle.onReady(cb),
        register: (props) => this.register(props),
      },
      appId: this.config.appId,
      libVersion: this.config.libVersion,
    };
    this.pluginBus.init(ctx);

    try {
      await bootstrapIDM({
        idm: this.idm,
        idmConfig: this.config.idm,
        register: (props) => this.register(props),
        onError: this.config.onError,
      });
    } finally {
      this.flushPrequeue();
      this.lifecycle.markReady();
    }
    return this;
  }

  track(
    event: string,
    properties: JSONObject = {},
    options?: TrackOptions
  ): void {
    if (this.destroyed) return;
    this.session.touch();

    if (!this.lifecycle.isReady()) {
      this.bufferEvent(event, properties, options, Date.now());
      return;
    }
    this.doTrack(event, properties, options, Date.now());
  }

  private bufferEvent(
    event: string,
    properties: JSONObject,
    options: TrackOptions | undefined,
    time: number
  ): void {
    const max = this.config.prequeue.maxSize;
    if (this.prequeue.length >= max) {
      const dropped = this.prequeue.shift();
      this.config.onError(
        new Error("prequeue overflow, oldest event dropped"),
        "prequeue_overflow",
        {
          maxSize: max,
          droppedEvent: dropped?.event,
        }
      );
    }
    this.prequeue.push({
      event,
      properties: cloneDeep(properties),
      options,
      time,
    });
  }

  private flushPrequeue(): void {
    const buffered = this.prequeue.splice(0);
    for (const item of buffered) {
      this.doTrack(item.event, item.properties, item.options, item.time);
    }
  }

  private doTrack(
    event: string,
    properties: JSONObject,
    options: TrackOptions | undefined,
    time: number
  ): void {
    const raw: RawEvent = {
      event,
      type: "track",
      time,
      properties: { ...properties },
    };

    let processed: RawEvent | null = raw;
    try {
      processed = this.pluginBus.beforeProcess(raw);
    } catch (err) {
      this.config.onError(err as Error, "pipeline_error", {
        stage: "beforeProcess",
        event,
      });
      processed = raw;
    }
    if (!processed) return;

    let envelope: EventEnvelope | null = null;
    try {
      envelope = this.pipeline.process(processed);
    } catch (err) {
      this.config.onError(err as Error, "pipeline_error", {
        stage: "pipeline",
        event,
      });
      return;
    }
    if (!envelope) return;

    const targets = this.resolveTargets(options?.reporters, event);
    if (!targets.length) return;

    for (const reporterName of targets) {
      const cloned = cloneDeep(envelope);
      const scoped = this.getScopedData(reporterName);
      if (scoped) cloned.reporterScope = scoped;
      this.queue.add(makeBatchKey(reporterName), cloned);
    }
  }

  private getScopedData(name: string): JSONObject | undefined {
    const provider = this.reporterDataProviders.get(name);
    if (!provider) return undefined;
    let value: unknown;
    try {
      value = provider();
    } catch (err) {
      this.config.onError(err as Error, "reporter_data_provider_failed", {
        reporterName: name,
      });
      return undefined;
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      return undefined;
    return cloneDeep(value as JSONObject);
  }

  identify(userId: string | null): boolean {
    if (this.destroyed) return false;
    if (this.idm.isLockedByProvider()) {
      this.config.onError(
        new Error("identify blocked by userIdProvider"),
        "identify_blocked",
        {
          userId,
        }
      );
      return false;
    }
    return this.idm.identify(userId, "identify");
  }

  register(props: JSONObject): void {
    if (this.destroyed) return;
    Object.assign(this.superProperties, props);
  }

  reset(): void {
    if (this.destroyed) return;
    this.idm.reset();
  }

  onReady(cb: () => void): void {
    if (this.destroyed) return;
    this.lifecycle.onReady(cb);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.offIdentitySync?.();
    this.offIdentitySync = null;
    this.prequeue.length = 0;
    this.queue.destroy();
    this.pluginBus.destroy();
    this.idm.destroy();
    this.session.destroy();
  }

  private resolveTargets(
    spec: TrackOptions["reporters"],
    event: string
  ): string[] {
    const known = Object.keys(this.reporters);
    if (spec === "*") {
      if (!known.length) {
        this.config.onError(
          new Error("no reporter registered"),
          "no_reporter_registered",
          {
            event,
          }
        );
      }
      return known;
    }
    if (Array.isArray(spec) && spec.length) {
      const valid: string[] = [];
      for (const name of spec) {
        if (this.reporters[name]) {
          valid.push(name);
        } else {
          this.config.onError(
            new Error(`unknown reporter: ${name}`),
            "route_invalid",
            {
              reporterName: name,
              event,
            }
          );
        }
      }
      return valid;
    }
    const targets = this.defaultReporters.filter(
      (name) => name in this.reporters
    );
    if (!targets.length) {
      this.config.onError(
        new Error("no reporter registered"),
        "no_reporter_registered",
        {
          event,
          defaultReporters: this.defaultReporters,
        }
      );
    }
    return targets;
  }

  private runPluginInit(plugin: Plugin): void {
    const ctx: PluginContext = {
      tracker: {
        onReady: (cb) => this.lifecycle.onReady(cb),
        register: (props) => this.register(props),
      },
      appId: this.config.appId,
      libVersion: this.config.libVersion,
    };
    try {
      plugin.init?.(ctx);
    } catch (err) {
      this.config.onError(err as Error, "plugin_error", {
        plugin: plugin.name,
        hook: "init",
      });
    }
  }
}

export function createTracker(config: TrackerConfig): Tracker {
  return new Tracker(config);
}

function pickStorage(onError: ResolvedConfig["onError"]): KVStorage {
  const local = createLocalStorage({
    onQuotaExceeded: (err) => onError(err, "storage_full"),
  });
  if (local.available) return local;
  onError(
    new Error("localStorage unavailable, fallback to memory"),
    "storage_unavailable"
  );
  return createMemoryStorage();
}
