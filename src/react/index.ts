import { useRef, useEffect, useCallback, useMemo, type RefObject } from 'react';
import { exposureManager } from '../core/exposure';
import { tracker } from '../core/tracker';
import type { ExposureOptions, ClickOptions, EventName } from '../core/types';
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
  const finalData = useMemo(
    () => reporters ? { ...data, _reporters: reporters } : data,
    [JSON.stringify(data), JSON.stringify(reporters)]
  );
  const stableOptions = useMemo(() => exposureOptions, [JSON.stringify(exposureOptions)]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const unbind = exposureManager.observe(el, event, finalData, stableOptions);

    return () => {
      unbind();
      exposureManager.reset(el);
    };
  }, [event, finalData, stableOptions]);

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
  const finalData = useMemo(
    () => reporters ? { ...data, _reporters: reporters } : data,
    [JSON.stringify(data), JSON.stringify(reporters)]
  );

  const handler = useCallback(() => {
    tracker.track(event, finalData);
  }, [event, JSON.stringify(finalData)]);

  const wrappedHandler = useMemo(() => {
    if (debounceMs > 0) {
      return debounce(handler, debounceMs);
    }
    if (throttleMs > 0) {
      return throttle(handler, throttleMs);
    }
    return handler;
  }, [handler, debounceMs, throttleMs]);

  return wrappedHandler;
}
