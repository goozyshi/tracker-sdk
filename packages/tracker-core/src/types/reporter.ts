import type { EventEnvelope } from './event';

export interface ReporterSendOptions {
  sync?: boolean;
}

export interface ReporterResult {
  ok: boolean;
  channel?: string;
  error?: Error;
}

export interface Reporter {
  name: string;
  send(
    envelopes: ReadonlyArray<Readonly<EventEnvelope>>,
    options?: ReporterSendOptions
  ): Promise<ReporterResult>;
}

export type ReporterRegistry = Record<string, Reporter>;

export interface BeforeSendContext {
  reporterName: string;
}
