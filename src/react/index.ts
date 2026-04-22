import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { exposureManager } from '../core/exposure';
import { tracker } from '../core/tracker';
import type { EventName } from '../core/types';
import { debounce, throttle } from '../core/utils';

export interface UseExposureOptions {
  reporters?: string[];
  threshold?: number;
  duration?: number;
  once?: boolean;
  groupKey?: string;
  groupDelay?: number;
}

export function useExposure<T extends HTMLElement = HTMLElement>(
  event: EventName,
  data?: Record<string, any>,
  options: UseExposureOptions = {}
): RefObject<T> {
  const ref = useRef<T>(null);
  const { reporters, ...exposureOptions } = options;

  const dataRef = useRef(data);
  const reportersRef = useRef(reporters);
  const optionsRef = useRef(exposureOptions);
  dataRef.current = data;
  reportersRef.current = reporters;
  optionsRef.current = exposureOptions;

  const dataKey = JSON.stringify(data);
  const reportersKey = JSON.stringify(reporters);
  const optionsKey = JSON.stringify(exposureOptions);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 使用序列化 key 追踪值变化，真实值通过 ref 读取
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reps = reportersRef.current;
    const d = dataRef.current;
    const opts = optionsRef.current;
    const finalData = reps ? { ...d, _reporters: reps } : d;
    const unbind = exposureManager.observe(el, event, finalData, opts);

    return () => {
      unbind();
      if (opts.once === false) {
        exposureManager.reset(el);
      }
    };
  }, [event, dataKey, reportersKey, optionsKey]);

  return ref;
}

export interface UseClickOptions {
  reporters?: string[];
  debounce?: number;
  throttle?: number;
}

export function useClick(
  event: EventName,
  data?: Record<string, any>,
  options: UseClickOptions = {}
): () => void {
  const { reporters, debounce: debounceMs = 0, throttle: throttleMs = 0 } = options;

  const dataRef = useRef(data);
  const reportersRef = useRef(reporters);
  dataRef.current = data;
  reportersRef.current = reporters;

  const handler = useCallback(() => {
    const reps = reportersRef.current;
    const d = dataRef.current;
    const finalData = reps ? { ...d, _reporters: reps } : d;
    tracker.track(event, finalData);
  }, [event]);

  const wrappedHandler = useMemo(() => {
    if (debounceMs > 0) return debounce(handler, debounceMs);
    if (throttleMs > 0) return throttle(handler, throttleMs);
    return handler;
  }, [handler, debounceMs, throttleMs]);

  return wrappedHandler;
}
