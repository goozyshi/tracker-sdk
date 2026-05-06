import type {
  Tracker,
  TrackOptions,
  TrackReportersSpec,
} from "@goozyshi/tracker-core";
import { type JSONValue, throttle } from "@goozyshi/tracker-shared";
import type { DOMEventProperties, ExposureOptions, UnbindFn } from "./types";

interface ExposureConfig {
  threshold: number;
  duration: number;
  once: boolean;
  groupKey?: string;
  groupDelay: number;
  reporters?: TrackReportersSpec;
}

type ValueOrGetter<T> = T | (() => T);
type ExposureDataInput = ValueOrGetter<DOMEventProperties>;

export class ExposureManager {
  private tracker: Tracker;
  private timers = new Map<Element, ReturnType<typeof setTimeout>>();
  private exposed = new WeakSet<Element>();
  private groups = new Map<
    string,
    {
      event: string;
      items: JSONValue[];
      timer: ReturnType<typeof setTimeout>;
      reporters?: TrackReportersSpec;
    }
  >();
  private observers = new WeakMap<Element, IntersectionObserver>();
  private scrollHandlers = new WeakMap<Element, () => void>();
  private supportIO = typeof IntersectionObserver !== "undefined";

  constructor(tracker: Tracker) {
    this.tracker = tracker;
  }

  observe(
    el: Element,
    event: string,
    data: ExposureDataInput,
    options: ExposureOptions = {}
  ): UnbindFn {
    const config: ExposureConfig = {
      threshold: options.threshold ?? 0.5,
      duration: options.duration ?? 0,
      once: options.once ?? true,
      groupKey: options.groupKey,
      groupDelay: options.groupDelay ?? 100,
      reporters: options.reporters,
    };

    if (config.once && this.exposed.has(el)) {
      return () => {};
    }

    if (this.supportIO) return this.observeWithIO(el, event, data, config);
    return this.observeWithScroll(el, event, data, config);
  }

  reset(el?: Element): void {
    if (el) {
      this.exposed.delete(el);
      const observer = this.observers.get(el);
      if (observer) {
        observer.unobserve(el);
        observer.disconnect();
        this.observers.delete(el);
      }
      const handler = this.scrollHandlers.get(el);
      if (handler) {
        window.removeEventListener("scroll", handler);
        window.removeEventListener("resize", handler);
        this.scrollHandlers.delete(el);
      }
    } else {
      this.exposed = new WeakSet();
    }
  }

  destroy(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const g of this.groups.values()) clearTimeout(g.timer);
    this.groups.clear();
  }

  private observeWithIO(
    el: Element,
    event: string,
    data: ExposureDataInput,
    config: ExposureConfig
  ): UnbindFn {
    const { threshold, duration, once, groupKey, groupDelay, reporters } =
      config;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (once && this.exposed.has(el)) return;

          if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
            if (duration > 0) {
              const existing = this.timers.get(el);
              if (existing) clearTimeout(existing);
              const timer = setTimeout(() => {
                this.handleExposure(
                  el,
                  event,
                  data,
                  once,
                  groupKey,
                  groupDelay,
                  reporters
                );
                this.timers.delete(el);
              }, duration);
              this.timers.set(el, timer);
            } else {
              this.handleExposure(
                el,
                event,
                data,
                once,
                groupKey,
                groupDelay,
                reporters
              );
            }
          } else {
            const timer = this.timers.get(el);
            if (timer) {
              clearTimeout(timer);
              this.timers.delete(el);
            }
          }
        }
      },
      { threshold: [threshold] }
    );

    observer.observe(el);
    this.observers.set(el, observer);

    return () => {
      observer.unobserve(el);
      observer.disconnect();
      this.observers.delete(el);
    };
  }

  private observeWithScroll(
    el: Element,
    event: string,
    data: ExposureDataInput,
    config: ExposureConfig
  ): UnbindFn {
    const { threshold, duration, once, groupKey, groupDelay, reporters } =
      config;

    const checkVisibility = () => {
      const rect = el.getBoundingClientRect();
      const viewHeight = window.innerHeight;
      const viewWidth = window.innerWidth;

      const visibleHeight =
        Math.min(rect.bottom, viewHeight) - Math.max(rect.top, 0);
      const visibleWidth =
        Math.min(rect.right, viewWidth) - Math.max(rect.left, 0);
      const visibleArea =
        Math.max(0, visibleHeight) * Math.max(0, visibleWidth);
      const totalArea = rect.height * rect.width;
      const ratio = totalArea > 0 ? visibleArea / totalArea : 0;

      if (ratio >= threshold) {
        if (duration > 0) {
          if (!this.timers.has(el)) {
            const timer = setTimeout(() => {
              this.handleExposure(
                el,
                event,
                data,
                once,
                groupKey,
                groupDelay,
                reporters
              );
              this.timers.delete(el);
            }, duration);
            this.timers.set(el, timer);
          }
        } else {
          this.handleExposure(
            el,
            event,
            data,
            once,
            groupKey,
            groupDelay,
            reporters
          );
        }
      } else {
        const timer = this.timers.get(el);
        if (timer) {
          clearTimeout(timer);
          this.timers.delete(el);
        }
      }
    };

    const throttledCheck = throttle(checkVisibility, 100);
    window.addEventListener("scroll", throttledCheck, { passive: true });
    window.addEventListener("resize", throttledCheck, { passive: true });
    this.scrollHandlers.set(el, throttledCheck);

    checkVisibility();

    return () => {
      window.removeEventListener("scroll", throttledCheck);
      window.removeEventListener("resize", throttledCheck);
      this.scrollHandlers.delete(el);
    };
  }

  private handleExposure(
    el: Element,
    event: string,
    data: ExposureDataInput,
    once: boolean,
    groupKey?: string,
    groupDelay = 100,
    reporters?: TrackReportersSpec
  ): void {
    const finalData =
      (typeof data === "function"
        ? (data as () => DOMEventProperties)()
        : data) ?? {};

    if (once) {
      if (this.exposed.has(el)) return;
      this.exposed.add(el);
    }

    if (groupKey) {
      this.addToGroup(
        groupKey,
        event,
        finalData as JSONValue,
        groupDelay,
        reporters
      );
    } else {
      const trackOptions: TrackOptions | undefined = reporters
        ? { reporters }
        : undefined;
      this.tracker.track(event, finalData, trackOptions);
    }
  }

  private addToGroup(
    key: string,
    event: string,
    data: JSONValue,
    delay: number,
    reporters?: TrackReportersSpec
  ): void {
    const group = this.groups.get(key);

    if (group) {
      clearTimeout(group.timer);
      group.items.push(data);
      group.reporters = reporters;
    } else {
      this.groups.set(key, {
        event,
        items: [data],
        timer: setTimeout(() => {}, 0),
        reporters,
      });
    }

    const g = this.groups.get(key);
    if (!g) return;
    g.timer = setTimeout(() => {
      const trackOptions: TrackOptions | undefined = g.reporters
        ? { reporters: g.reporters }
        : undefined;
      this.tracker.track(
        g.event,
        { items: g.items, count: g.items.length },
        trackOptions
      );
      this.groups.delete(key);
    }, delay);
  }
}
