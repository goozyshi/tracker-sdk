import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { exposureManager } from '../core/exposure';
import { tracker } from '../core/tracker';
import type { EventName, ReporterDataMap, TrackOptions } from '../core/types';
import { debounce, throttle } from '../core/utils';

export interface UseExposureOptions {
  reporters?: string[];
  reporterData?: ReporterDataMap;
  threshold?: number;
  duration?: number;
  once?: boolean;
  groupKey?: string;
  groupDelay?: number;
}

export function useExposure<T extends HTMLElement = HTMLElement>(
  event: EventName,
  data?: Record<string, unknown>,
  options: UseExposureOptions = {}
): RefObject<T> {
  const ref = useRef<T>(null);
  const { reporters, reporterData, ...exposureOptions } = options;

  const dataRef = useRef(data);
  const reportersRef = useRef(reporters);
  const reporterDataRef = useRef(reporterData);
  const optionsRef = useRef(exposureOptions);
  dataRef.current = data;
  reportersRef.current = reporters;
  reporterDataRef.current = reporterData;
  optionsRef.current = exposureOptions;

  const unbindRef = useRef<(() => void) | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: data/reporters/reporterData 通过 ref 延迟读取
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const opts = optionsRef.current;

    if (unbindRef.current) {
      unbindRef.current();
      if (opts.once === false) exposureManager.reset(el);
    }

    unbindRef.current = exposureManager.observe(
      el,
      event,
      () => dataRef.current,
      opts,
      () => createTrackOptions(reportersRef.current, reporterDataRef.current)
    );
  }, [
    event,
    exposureOptions.threshold,
    exposureOptions.duration,
    exposureOptions.once,
    exposureOptions.groupKey,
    exposureOptions.groupDelay,
  ]);

  useEffect(() => {
    return () => {
      if (unbindRef.current) {
        unbindRef.current();
        unbindRef.current = null;
      }
      const el = ref.current;
      if (el && optionsRef.current.once === false) {
        exposureManager.reset(el);
      }
    };
  }, []);

  return ref;
}

export interface UseClickOptions {
  reporters?: string[];
  reporterData?: ReporterDataMap;
  debounce?: number;
  throttle?: number;
}

export function useClick(
  event: EventName,
  data?: Record<string, unknown>,
  options: UseClickOptions = {}
): () => void {
  const { reporters, reporterData, debounce: debounceMs = 0, throttle: throttleMs = 0 } = options;

  const dataRef = useRef(data);
  const reportersRef = useRef(reporters);
  const reporterDataRef = useRef(reporterData);
  dataRef.current = data;
  reportersRef.current = reporters;
  reporterDataRef.current = reporterData;

  const handler = useCallback(() => {
    tracker.track(
      event,
      dataRef.current,
      createTrackOptions(reportersRef.current, reporterDataRef.current)
    );
  }, [event]);

  const wrappedHandler = useMemo(() => {
    if (debounceMs > 0) return debounce(handler, debounceMs);
    if (throttleMs > 0) return throttle(handler, throttleMs);
    return handler;
  }, [handler, debounceMs, throttleMs]);

  return wrappedHandler;
}

function createTrackOptions(
  reporters?: string[],
  reporterData?: ReporterDataMap
): TrackOptions | undefined {
  if (!reporters && !reporterData) return undefined;
  return {
    reporters,
    reporterData,
  };
}
