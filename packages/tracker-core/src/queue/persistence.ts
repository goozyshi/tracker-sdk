import type { KVStorage } from '../storage/index';
import { EVENT_SCHEMA_VERSION, type EventEnvelope } from '../types/event';

export const QUEUE_SCHEMA = 'v2';

export function offlineKey(prefix: string, batchKey: string): string {
  return `${prefix}:${QUEUE_SCHEMA}:offline:${batchKey}`;
}

export function offlineIndexKey(prefix: string): string {
  return `${prefix}:${QUEUE_SCHEMA}:offline:_keys`;
}

export function readEnvelopes(storage: KVStorage, key: string): EventEnvelope[] {
  const raw = storage.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEnvelope);
  } catch {
    return [];
  }
}

export function writeEnvelopes(storage: KVStorage, key: string, envelopes: EventEnvelope[]): void {
  if (!envelopes.length) {
    storage.remove(key);
    return;
  }
  storage.set(key, JSON.stringify(envelopes));
}

export function readBatchKeyIndex(storage: KVStorage, prefix: string): Set<string> {
  const raw = storage.get(offlineIndexKey(prefix));
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

export function writeBatchKeyIndex(storage: KVStorage, prefix: string, keys: Set<string>): void {
  if (!keys.size) {
    storage.remove(offlineIndexKey(prefix));
    return;
  }
  storage.set(offlineIndexKey(prefix), JSON.stringify(Array.from(keys)));
}

function isValidEnvelope(value: unknown): value is EventEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === EVENT_SCHEMA_VERSION &&
    typeof v.eventId === 'string' &&
    typeof v.event === 'string' &&
    typeof v.time === 'number' &&
    v.identity != null &&
    typeof v.identity === 'object' &&
    v.app != null &&
    typeof v.app === 'object' &&
    v.system != null &&
    typeof v.system === 'object' &&
    v.properties != null &&
    typeof v.properties === 'object'
  );
}
