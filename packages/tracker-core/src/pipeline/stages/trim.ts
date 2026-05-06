import type { JSONObject, JSONValue } from "@goozyshi/tracker-shared";
import type { PipelineTrimConfig } from "../../types/config";
import type { PipelineState } from "../state";

export type TrimStage = (state: PipelineState) => PipelineState;

export function createTrimStage(
  config: Required<PipelineTrimConfig>
): TrimStage {
  return (state) => {
    if (!state.envelope) return state;
    const trimmed = walk(state.envelope.properties, config, 0) as JSONObject;
    return { ...state, envelope: { ...state.envelope, properties: trimmed } };
  };
}

function walk(
  value: JSONValue,
  cfg: Required<PipelineTrimConfig>,
  depth: number
): JSONValue {
  if (depth >= cfg.maxDepth) {
    if (value && typeof value === "object")
      return Array.isArray(value) ? [] : {};
    return value;
  }
  if (typeof value === "string") {
    return value.length > cfg.maxStringLength
      ? value.slice(0, cfg.maxStringLength)
      : value;
  }
  if (Array.isArray(value)) {
    const sliced = value.slice(0, cfg.maxArrayLength);
    return sliced.map((v) => walk(v, cfg, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: JSONObject = {};
    let count = 0;
    for (const [k, v] of Object.entries(value)) {
      if (count >= cfg.maxObjectKeys) break;
      out[k] = walk(v, cfg, depth + 1);
      count += 1;
    }
    return out;
  }
  return value;
}
