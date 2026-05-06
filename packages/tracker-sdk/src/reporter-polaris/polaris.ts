import type {
  CapabilityRecord,
  EventEnvelope,
  Reporter,
  SystemContext,
} from "@goozyshi/tracker-core";
import type { JSONValue } from "@goozyshi/tracker-shared";
import { createHttpReporter } from "../http-reporter";
import type {
  PolarisEnv,
  PolarisEventItem,
  PolarisPayload,
  PolarisPublicInfo,
  PolarisReporterOptions,
} from "./types";

const REPORTER_NAME = "polaris";

const ENV_URLS: Partial<Record<PolarisEnv, string>> = {
  test: "/api/middle/client/h5/event",
};

const SYSTEM_KEY_MAP: Record<keyof SystemContext, string> = {
  runtime: "lib_runtime",
  url: "url",
  referrer: "referrer",
  title: "title",
  ua: "ua",
  viewportWidth: "viewport_width",
  viewportHeight: "viewport_height",
  screenWidth: "screen_width",
  screenHeight: "screen_height",
  timezoneOffset: "timezone_offset",
};

export function createPolarisReporter(
  options: PolarisReporterOptions
): Reporter {
  validateOptions(options);

  const env = options.env ?? "test";
  const defaultUrl = resolveEnvUrl(env);
  const promotedFields = new Set(options.publicInfoFieldWhitelist ?? []);

  return createHttpReporter({
    name: REPORTER_NAME,
    url: (ch) => options.endpoints?.[ch] ?? defaultUrl,
    method: options.method,
    headers: options.headers,
    credentials: options.credentials,
    timeout: options.timeout,
    channels: options.channels,
    buildBody: (envs) =>
      envelopesToPayload(envs, options.biz, options.publicInfo, promotedFields),
  });
}

function envelopesToPayload(
  envelopes: ReadonlyArray<Readonly<EventEnvelope>>,
  biz: string,
  publicInfoSource: PolarisPublicInfo | undefined,
  promotedFields: Set<string>
): PolarisPayload {
  const first = envelopes[0];
  const publicInfo: Record<string, JSONValue> = {
    ...resolvePublicInfo(publicInfoSource),
    anonymous_id: first.identity.anonymousId,
    user_id: first.identity.userId ?? "",
    session_id: first.identity.sessionId,
    app_id: first.app.appId,
    lib_name: first.app.lib.name,
    lib_version: first.app.lib.version,
    ...mapSystem(first.system),
  };

  const firstScopePublic = extractScopePublic(first.reporterScope);
  if (firstScopePublic) Object.assign(publicInfo, firstScopePublic);

  const events: PolarisEventItem[] = envelopes.map((envelope) => {
    const extra: Record<string, JSONValue> = {};
    for (const [key, value] of Object.entries(envelope.properties)) {
      if (promotedFields.has(key)) {
        publicInfo[key] = value as JSONValue;
      } else {
        extra[key] = value as JSONValue;
      }
    }
    if (envelope.capability) {
      Object.assign(extra, flattenCapability(envelope.capability));
    }
    const scopeExtra = extractScopeExtra(envelope.reporterScope);
    if (scopeExtra) Object.assign(extra, scopeExtra);
    return {
      event_name: envelope.event,
      client_timestamp: envelope.time,
      event_id: envelope.eventId,
      extra,
    };
  });

  return {
    biz,
    public_info: publicInfo,
    events,
    extra: {},
    ab_info: {},
  };
}

function extractScopePublic(
  scope: EventEnvelope["reporterScope"]
): Record<string, JSONValue> | undefined {
  if (!scope) return undefined;
  const value = scope.publicInfo;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return { ...(value as Record<string, JSONValue>) };
}

function extractScopeExtra(
  scope: EventEnvelope["reporterScope"]
): Record<string, JSONValue> | undefined {
  if (!scope) return undefined;
  const out: Record<string, JSONValue> = {};
  for (const [key, value] of Object.entries(scope)) {
    if (key === "publicInfo") continue;
    out[key] = value as JSONValue;
  }
  return Object.keys(out).length ? out : undefined;
}

function mapSystem(system: SystemContext): Record<string, JSONValue> {
  const out: Record<string, JSONValue> = {};
  for (const [key, value] of Object.entries(system)) {
    if (value === undefined) continue;
    const mapped = SYSTEM_KEY_MAP[key as keyof SystemContext];
    if (mapped) out[mapped] = value as JSONValue;
  }
  return out;
}

function flattenCapability(
  capability: CapabilityRecord
): Record<string, JSONValue> {
  const out: Record<string, JSONValue> = {};
  for (const [domain, fields] of Object.entries(capability)) {
    if (!fields || typeof fields !== "object") continue;
    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      out[`${domain}_${camelToSnake(field)}`] = value as JSONValue;
    }
  }
  return out;
}

function camelToSnake(input: string): string {
  return input.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function resolvePublicInfo(
  source: PolarisPublicInfo | undefined
): Record<string, JSONValue> {
  if (!source) return {};
  const value = typeof source === "function" ? source() : source;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value } as Record<string, JSONValue>;
}

function resolveEnvUrl(env: PolarisEnv): string {
  const url = ENV_URLS[env];
  if (url) return url;
  throw new Error(
    `polaris reporter env=${env} is not available in this SDK version`
  );
}

function validateOptions(options: PolarisReporterOptions): void {
  if (!options || typeof options !== "object") {
    throw new Error("polaris reporter options must be an object");
  }
  if (!options.biz || typeof options.biz !== "string") {
    throw new Error("polaris reporter options.biz is required (string)");
  }
  resolveEnvUrl(options.env ?? "test");
}
