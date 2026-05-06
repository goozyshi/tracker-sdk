import { uuidV4 } from "@goozyshi/tracker-shared";
import {
  EVENT_SCHEMA_VERSION,
  type EventApp,
  type EventIdentity,
} from "../../types/event";
import type { PipelineState } from "../state";

export type InjectIdentityStage = (state: PipelineState) => PipelineState;

export interface InjectIdentityOptions {
  identityGetter: () => EventIdentity;
  app: EventApp;
}

export function createInjectIdentityStage(
  options: InjectIdentityOptions
): InjectIdentityStage {
  return (state) => {
    const identity = options.identityGetter();
    const properties = {
      ...state.superProperties,
      ...state.raw.properties,
    };
    return {
      ...state,
      envelope: {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventId: uuidV4(),
        event: state.raw.event,
        type: state.raw.type,
        time: state.raw.time,
        identity,
        app: options.app,
        system: { ...state.system },
        properties,
      },
    };
  };
}
