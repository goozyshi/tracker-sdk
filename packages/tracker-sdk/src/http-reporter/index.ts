import type {
  EventEnvelope,
  Reporter,
  ReporterResult,
} from "@goozyshi/tracker-core";
import { type TransportChannel, transport } from "@goozyshi/tracker-shared";

export type HttpReporterUrl = string | ((channel: TransportChannel) => string);

export type HttpReporterBody = (
  envelopes: ReadonlyArray<Readonly<EventEnvelope>>,
  channel: TransportChannel
) => unknown;

export interface HttpReporterOptions {
  name: string;
  url: HttpReporterUrl;
  buildBody: HttpReporterBody;
  channels?: TransportChannel[];
  method?: "POST" | "GET";
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  timeout?: number;
}

const DEFAULT_CHANNELS: TransportChannel[] = [
  "fetch",
  "beacon",
  "image",
  "xhr",
];

export function createHttpReporter(options: HttpReporterOptions): Reporter {
  validateHttpOptions(options);

  const channels = options.channels ?? DEFAULT_CHANNELS;
  const resolveUrl =
    typeof options.url === "function"
      ? options.url
      : (_ch: TransportChannel) => options.url as string;

  return {
    name: options.name,
    async send(envelopes, sendOptions = {}): Promise<ReporterResult> {
      if (!envelopes.length) return { ok: true };
      try {
        const channel = await transport(
          (ch) => ({
            url: resolveUrl(ch),
            method: options.method,
            headers: options.headers,
            credentials: options.credentials,
            timeout: options.timeout,
            body: options.buildBody(envelopes, ch),
          }),
          channels,
          sendOptions.sync ?? false
        );
        return { ok: true, channel };
      } catch (err) {
        return { ok: false, error: err as Error };
      }
    },
  };
}

function validateHttpOptions(options: HttpReporterOptions): void {
  if (!options || typeof options !== "object") {
    throw new Error("http reporter options must be an object");
  }
  if (!options.name || typeof options.name !== "string") {
    throw new Error("http reporter options.name is required (string)");
  }
  if (typeof options.url !== "string" && typeof options.url !== "function") {
    throw new Error("http reporter options.url must be a string or function");
  }
  if (typeof options.buildBody !== "function") {
    throw new Error("http reporter options.buildBody must be a function");
  }
  if (options.channels) {
    const invalid = options.channels.filter(
      (c) => !DEFAULT_CHANNELS.includes(c)
    );
    if (invalid.length) {
      throw new Error(`http reporter invalid channels: ${invalid.join(", ")}`);
    }
  }
}
