import type { ExposureOptions, UnbindFn } from './types';
import { tracker } from './tracker';
import { throttle } from './utils';

interface ExposureConfig {
  threshold: number;
  duration: number;
  once: boolean;
  groupKey?: string;
  groupDelay: number;
}

export class ExposureManager {
  private timers = new Map<Element, ReturnType<typeof setTimeout>>();
  private exposed = new WeakSet<Element>();
  private groups = new Map<string, { event: string; items: any[]; timer: ReturnType<typeof setTimeout> }>();
  private observers = new WeakMap<Element, IntersectionObserver>();
  private scrollHandlers = new WeakMap<Element, () => void>();
  private supportIO = typeof IntersectionObserver !== 'undefined';

  observe(
    el: Element,
    event: string,
    data: Record<string, any> | undefined,
    options: ExposureOptions = {}
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
      return this.observeWithIO(el, event, data, config);
    } else {
      return this.observeWithScroll(el, event, data, config);
    }
  }

  private observeWithIO(
    el: Element,
    event: string,
    data: Record<string, any> | undefined,
    config: ExposureConfig
  ): UnbindFn {
    const { threshold, duration, once, groupKey, groupDelay } = config;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
            if (duration > 0) {
              const timer = setTimeout(() => {
                this.handleExposure(el, event, data, once, groupKey, groupDelay);
                this.timers.delete(el);
              }, duration);
              this.timers.set(el, timer);
            } else {
              this.handleExposure(el, event, data, once, groupKey, groupDelay);
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
    data: Record<string, any> | undefined,
    config: ExposureConfig
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
              this.handleExposure(el, event, data, once, groupKey, groupDelay);
              this.timers.delete(el);
            }, duration);
            this.timers.set(el, timer);
          }
        } else {
          this.handleExposure(el, event, data, once, groupKey, groupDelay);
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
    data: any,
    once: boolean,
    groupKey?: string,
    groupDelay = 100
  ): void {
    if (once) {
      if (this.exposed.has(el)) return;
      this.exposed.add(el);
    }

    if (groupKey) {
      this.addToGroup(groupKey, event, data, groupDelay);
    } else {
      tracker.track(event, data);
    }
  }

  private addToGroup(key: string, event: string, data: any, delay: number): void {
    const group = this.groups.get(key);

    if (group) {
      clearTimeout(group.timer);
      group.items.push(data);
    } else {
      this.groups.set(key, { event, items: [data], timer: setTimeout(() => {}, 0) });
    }

    const g = this.groups.get(key)!;
    g.timer = setTimeout(() => {
      tracker.track(g.event, { items: g.items, count: g.items.length });
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
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.groups.forEach((g) => clearTimeout(g.timer));
    this.groups.clear();
  }
}

export const exposureManager = new ExposureManager();
