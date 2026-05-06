import type { Tracker, TrackOptions } from "@goozyshi/tracker-core";
import { debounce, type JSONObject, throttle } from "@goozyshi/tracker-shared";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { ClickManager } from "./dom/click";
import { ExposureManager } from "./dom/exposure";
import type { ClickOptions, ExposureOptions, UnbindFn } from "./dom/types";

export type UseExposureOptions = ExposureOptions;
export type UseClickOptions = ClickOptions;

export interface ReactBindings {
  useExposure: <T extends HTMLElement = HTMLElement>(
    event: string,
    data?: JSONObject,
    options?: UseExposureOptions
  ) => RefObject<T>;
  useClick: (
    event: string,
    data?: JSONObject,
    options?: UseClickOptions
  ) => () => void;
  useBindClick: <T extends HTMLElement = HTMLElement>(
    event: string,
    data?: JSONObject,
    options?: UseClickOptions
  ) => RefObject<T>;
  useTracker: () => Tracker;
}

export function createReactBindings(tracker: Tracker): ReactBindings {
  const click = new ClickManager(tracker);
  const exposure = new ExposureManager(tracker);

  function useExposure<T extends HTMLElement = HTMLElement>(
    event: string,
    data?: JSONObject,
    options: UseExposureOptions = {}
  ): RefObject<T> {
    const ref = useRef<T>(null);
    const dataRef = useRef(data);
    dataRef.current = data;

    // biome-ignore lint/correctness/useExhaustiveDependencies: data 通过 ref 传递避免重新订阅
    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const unbind: UnbindFn = exposure.observe(
        el,
        event,
        () => dataRef.current,
        options
      );
      return () => unbind();
    }, [
      event,
      options.threshold,
      options.duration,
      options.once,
      options.groupKey,
      options.groupDelay,
    ]);

    return ref;
  }

  function useClick(
    event: string,
    data?: JSONObject,
    options: UseClickOptions = {}
  ): () => void {
    const dataRef = useRef(data);
    dataRef.current = data;
    const reportersRef = useRef(options.reporters);
    reportersRef.current = options.reporters;

    const { debounce: debounceMs = 0, throttle: throttleMs = 0 } = options;

    return useMemo(() => {
      const baseFn = () => {
        const reporters = reportersRef.current;
        const trackOptions: TrackOptions | undefined = reporters
          ? { reporters }
          : undefined;
        tracker.track(event, dataRef.current ?? {}, trackOptions);
      };
      if (debounceMs > 0) return debounce(baseFn, debounceMs);
      if (throttleMs > 0) return throttle(baseFn, throttleMs);
      return baseFn;
    }, [event, debounceMs, throttleMs]);
  }

  function useBindClick<T extends HTMLElement = HTMLElement>(
    event: string,
    data?: JSONObject,
    options: UseClickOptions = {}
  ): RefObject<T> {
    const ref = useRef<T>(null);
    const dataRef = useRef(data);
    dataRef.current = data;

    // biome-ignore lint/correctness/useExhaustiveDependencies: data 通过 ref 传递避免重新订阅
    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const unbind = click.bindClick(el, event, dataRef.current, options);
      return () => unbind();
    }, [event, options.debounce, options.throttle]);

    return ref;
  }

  function useTracker(): Tracker {
    return useMemo(() => tracker, []);
  }

  return { useExposure, useClick, useBindClick, useTracker };
}
