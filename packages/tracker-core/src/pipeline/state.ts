import type { JSONObject } from "@goozyshi/tracker-shared";
import type { EventEnvelope, RawEvent, SystemContext } from "../types/event";

export interface PipelineState {
  raw: RawEvent;
  system: SystemContext;
  superProperties: JSONObject;
  envelope: EventEnvelope | null;
}

export function createInitialState(raw: RawEvent): PipelineState {
  return {
    raw,
    system: {},
    superProperties: {},
    envelope: null,
  };
}
