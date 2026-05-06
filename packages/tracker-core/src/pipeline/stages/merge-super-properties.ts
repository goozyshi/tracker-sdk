import type { JSONObject } from "@goozyshi/tracker-shared";
import type { PipelineState } from "../state";

export type MergeSuperPropertiesStage = (state: PipelineState) => PipelineState;

export function createMergeSuperPropertiesStage(
  superPropertiesGetter: () => JSONObject
): MergeSuperPropertiesStage {
  return (state) => ({
    ...state,
    superProperties: { ...superPropertiesGetter() },
  });
}
