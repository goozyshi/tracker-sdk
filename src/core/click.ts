import type { ClickOptions, UnbindFn } from './types';
import { tracker } from './tracker';
import { debounce, throttle } from './utils';

export class ClickManager {
  private bindingMap = new WeakMap<Element, () => void>();

  bindClick(
    el: Element,
    event: string,
    data: Record<string, any> | undefined,
    options: ClickOptions = {}
  ): UnbindFn {
    const { debounce: debounceMs = 0, throttle: throttleMs = 0 } = options;

    let handler = () => tracker.track(event, data);

    if (debounceMs > 0) {
      handler = debounce(handler, debounceMs);
    } else if (throttleMs > 0) {
      handler = throttle(handler, throttleMs);
    }

    el.addEventListener('click', handler);
    this.bindingMap.set(el, handler);

    return () => {
      el.removeEventListener('click', handler);
      this.bindingMap.delete(el);
    };
  }
}

export const clickManager = new ClickManager();
