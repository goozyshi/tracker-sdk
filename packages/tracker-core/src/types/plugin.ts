import type { JSONObject } from "@goozyshi/tracker-shared";
import type { EventEnvelope, RawEvent } from "./event";
import type { BeforeSendContext, ReporterResult } from "./reporter";

export interface PluginTrackerHandle {
  onReady(cb: () => void): void;
  register(props: JSONObject): void;
}

export interface PluginContext {
  tracker: PluginTrackerHandle;
  appId: string;
  libVersion: string;
}

export interface Plugin {
  name: string;
  init?(ctx: PluginContext): void;
  beforeProcess?(raw: RawEvent): RawEvent | null;
  beforeSend?(batch: EventEnvelope[], ctx: BeforeSendContext): EventEnvelope[];
  afterSend?(
    batch: EventEnvelope[],
    result: ReporterResult,
    ctx: BeforeSendContext
  ): void;
}
