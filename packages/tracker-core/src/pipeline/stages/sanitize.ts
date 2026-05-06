import type { JSONObject, JSONValue } from "@goozyshi/tracker-shared";
import type { PipelineState } from "../state";

export type SanitizeStage = (state: PipelineState) => PipelineState;

const REDACTED = "[REDACTED]";

export function createSanitizeStage(blacklist: string[]): SanitizeStage {
  const set = new Set(blacklist.map((k) => k.toLowerCase()));
  return (state) => {
    if (!state.envelope) return state;
    const sanitized = walk(state.envelope.properties, set) as JSONObject;
    return { ...state, envelope: { ...state.envelope, properties: sanitized } };
  };
}

function walk(value: JSONValue, blacklist: Set<string>): JSONValue {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((v) => walk(v, blacklist));
  if (typeof value === "object") {
    const out: JSONObject = {};
    for (const [k, v] of Object.entries(value)) {
      if (blacklist.has(k.toLowerCase())) {
        out[k] = REDACTED;
      } else {
        out[k] = walk(v, blacklist);
      }
    }
    return out;
  }
  return value;
}
