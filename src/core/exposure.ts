import { tracker } from './tracker';
import type { ExposureOptions, TrackOptions, UnbindFn } from './types';
import { throttle } from './utils';

interface ExposureConfig {
  threshold: number;
  duration: number;
  once: boolean;
  groupKey?: string;
  groupDelay: number;
}

type ValueOrGetter<T> = T | (() => T);
type ExposureDataInput = ValueOrGetter<Record<string, unknown> | undefined>;
type TrackOptionsInput = ValueOrGetter<TrackOptions | undefined>;

export class ExposureManager {
  private timers = new Map<Element, ReturnType<typeof setTimeout>>();
  private exposed = new WeakSet<Element>();
  private groups = new Map<
    string,
    {
      event: string;
      items: unknown[];
      timer: ReturnType<typeof setTimeout>;
      trackOptions?: TrackOptions;
    }
  >();
  private observers = new WeakMap<Element, IntersectionObserver>();
  private scrollHandlers = new WeakMap<Element, () => void>();
  private supportIO = typeof IntersectionObserver !== 'undefined';

  observe(
    el: Element,
    event: string,
    data: ExposureDataInput,
    options: ExposureOptions = {},
    trackOptions?: TrackOptionsInput
  ): UnbindFn {
    const config: ExposureConfig = {
      threshold: options.threshold ?? 0.5,
      duration: options.duration ?? 0,
      once: options.once ?? true,
      groupKey: options.groupKey,
      groupDelay: options.groupDelay ?? 100,
    };

    if (config.once && this.exposed.has(el)) {
      return () => {};
    }

    if (this.supportIO) {
      return this.observeWithIO(el, event, data, config, trackOptions);
    } else {
      return this.observeWithScroll(el, event, data, config, trackOptions);
    }
  }

  private observeWithIO(
    el: Element,
    event: string,
    data: ExposureDataInput,
    config: ExposureConfig,
    trackOptions?: TrackOptionsInput
  ): UnbindFn {
    const { threshold, duration, once, groupKey, groupDelay } = config;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (once && this.exposed.has(el)) return;

          if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
            if (duration > 0) {
              const existing = this.timers.get(el);
              if (existing) clearTimeout(existing);
              const timer = setTimeout(() => {
                this.handleExposure(el, event, data, once, groupKey, groupDelay, trackOptions);
                this.timers.delete(el);
              }, duration);
              this.timers.set(el, timer);
            } else {
              this.handleExposure(el, event, data, once, groupKey, groupDelay, trackOptions);
            }
          } else {
            const timer = this.timers.get(el);
            if (timer) {
              clearTimeout(timer);
              this.timers.delete(el);
            }
          }
        });
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
    config: ExposureConfig,
    trackOptions?: TrackOptionsInput
  ): UnbindFn {
    const { threshold, duration, once, groupKey, groupDelay } = config;

    const checkVisibility = () => {
      const rect = el.getBoundingClientRect();
      const viewHeight = window.innerHeight;
      const viewWidth = window.innerWidth;

      const visibleHeight = Math.min(rect.bottom, viewHeight) - Math.max(rect.top, 0);
      const visibleWidth = Math.min(rect.right, viewWidth) - Math.max(rect.left, 0);
      const visibleArea = Math.max(0, visibleHeight) * Math.max(0, visibleWidth);
      const totalArea = rect.height * rect.width;
      const ratio = totalArea > 0 ? visibleArea / totalArea : 0;

      if (ratio >= threshold) {
        if (duration > 0) {
          if (!this.timers.has(el)) {
            const timer = setTimeout(() => {
              this.handleExposure(el, event, data, once, groupKey, groupDelay, trackOptions);
              this.timers.delete(el);
            }, duration);
            this.timers.set(el, timer);
          }
        } else {
          this.handleExposure(el, event, data, once, groupKey, groupDelay, trackOptions);
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
    window.addEventListener('scroll', throttledCheck, { passive: true });
    window.addEventListener('resize', throttledCheck, { passive: true });
    this.scrollHandlers.set(el, throttledCheck);

    checkVisibility();

    return () => {
      window.removeEventListener('scroll', throttledCheck);
      window.removeEventListener('resize', throttledCheck);
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
    trackOptions?: TrackOptionsInput
  ): void {
    const finalData = resolveValue(data);
    const finalTrackOptions = resolveValue(trackOptions);

    if (once) {
      if (this.exposed.has(el)) return;
      this.exposed.add(el);
    }

    if (groupKey) {
      this.addToGroup(groupKey, event, finalData, groupDelay, finalTrackOptions);
    } else {
      tracker.track(event, finalData, finalTrackOptions);
    }
  }

  private addToGroup(
    key: string,
    event: string,
    data: unknown,
    delay: number,
    trackOptions?: TrackOptions
  ): void {
    const group = this.groups.get(key);

    if (group) {
      clearTimeout(group.timer);
      group.items.push(data);
    } else {
      this.groups.set(key, {
        event,
        items: [data],
        timer: setTimeout(() => {}, 0),
        trackOptions,
      });
    }

    const g = this.groups.get(key);
    if (!g) return;
    g.timer = setTimeout(() => {
      tracker.track(g.event, { items: g.items, count: g.items.length }, g.trackOptions);
      this.groups.delete(key);
    }, delay);
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
        window.removeEventListener('scroll', handler);
        window.removeEventListener('resize', handler);
        this.scrollHandlers.delete(el);
      }
    } else {
      this.exposed = new WeakSet();
    }
  }

  destroy(): void {
    this.timers.forEach((t) => {
      clearTimeout(t);
    });
    this.timers.clear();
    this.groups.forEach((g) => {
      clearTimeout(g.timer);
    });
    this.groups.clear();
  }
}

export const exposureManager = new ExposureManager();

function resolveValue<T>(value: ValueOrGetter<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}
