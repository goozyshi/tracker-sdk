import type { Tracker } from "@goozyshi/tracker-core";

export interface TrackerStub {
  _q?: Array<[string, ArrayLike<unknown>]>;
}

export interface InstallStubOptions {
  globalKey?: string;
  global?: Record<string, unknown>;
}

export function installStub(
  real: Tracker,
  options: InstallStubOptions = {}
): void {
  const g = (options.global ?? (globalThis as unknown)) as Record<
    string,
    unknown
  >;
  const key = options.globalKey ?? "tracker";
  const stub = g[key] as TrackerStub | undefined;

  g[key] = real as unknown as Record<string, unknown>[string];

  const queue = stub?._q;
  if (!Array.isArray(queue) || !queue.length) return;

  const target = real as unknown as Record<string, unknown>;
  for (const entry of queue) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [method, rawArgs] = entry;
    if (typeof method !== "string") continue;
    const args =
      rawArgs == null ? [] : Array.from(rawArgs as ArrayLike<unknown>);
    const fn = target[method];
    if (typeof fn !== "function") continue;
    try {
      (fn as (...a: unknown[]) => unknown).apply(real, args);
    } catch {
      // 单条失败隔离，避免影响后续条目
    }
  }

  if (stub) stub._q = [];
}

export const STUB_SNIPPET =
  '(function(w,k){var q=[];function e(m){return function(){q.push([m,arguments])}}var s={_q:q,onReady:e("onReady")};if(typeof Proxy==="function"){w[k]=new Proxy(s,{get:function(t,m){if(m==="_q")return q;if(m==="onReady")return t.onReady;if(typeof m==="symbol"||m==="then")return undefined;return e(m)}})}else{w[k]=s}})(window,"tracker");';
