import type {
  JSONObject,
  JSONValue,
  TransportChannel,
} from "@goozyshi/tracker-shared";

export type PolarisEnv = "test" | "prod";

export type PolarisPublicInfo = JSONObject | (() => JSONObject);

export interface PolarisReporterOptions {
  biz: string;
  env?: PolarisEnv;
  endpoints?: Partial<Record<TransportChannel, string>>;
  publicInfo?: PolarisPublicInfo;
  publicInfoFieldWhitelist?: string[];
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  timeout?: number;
  channels?: TransportChannel[];
  method?: "POST" | "GET";
}

export interface PolarisEventItem {
  event_name: string;
  client_timestamp: number;
  event_id: string;
  extra: Record<string, JSONValue>;
}

export interface PolarisPayload {
  biz: string;
  public_info: Record<string, JSONValue>;
  events: PolarisEventItem[];
  extra: Record<string, JSONValue>;
  ab_info: Record<string, JSONValue>;
}
