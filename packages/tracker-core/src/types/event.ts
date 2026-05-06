import type { JSONObject } from "@goozyshi/tracker-shared";
import type { RuntimeKind } from "../runtime/detect";

export const EVENT_SCHEMA_VERSION = "tracker.v1" as const;
export type EventSchemaVersion = typeof EVENT_SCHEMA_VERSION;

export type EventType = "track";

export interface EventIdentity {
  anonymousId: string;
  userId: string | null;
  sessionId: string;
}

export interface EventApp {
  appId: string;
  lib: { name: string; version: string };
}

export interface SystemContext {
  runtime?: RuntimeKind;
  url?: string;
  referrer?: string;
  title?: string;
  ua?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  screenWidth?: number;
  screenHeight?: number;
  timezoneOffset?: number;
}

export interface CapabilityRecord {
  autotrack?: { elPath?: string; elText?: string; elRole?: string };
  replay?: { sessionId?: string; offset?: number; chunkId?: string };
  perf?: { lcp?: number; fcp?: number; cls?: number; inp?: number };
  [key: string]: JSONObject | undefined;
}

export interface RawEvent {
  event: string;
  type: EventType;
  time: number;
  properties: JSONObject;
}

export interface EventEnvelope {
  schemaVersion: EventSchemaVersion;
  eventId: string;
  event: string;
  type: EventType;
  time: number;
  identity: EventIdentity;
  app: EventApp;
  system: SystemContext;
  capability?: CapabilityRecord;
  properties: JSONObject;
  reporterScope?: JSONObject;
}

export type TrackReportersSpec = string[] | "*";

export interface TrackOptions {
  reporters?: TrackReportersSpec;
}
