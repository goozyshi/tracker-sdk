import type { Tracker, TrackOptions } from "@goozyshi/tracker-core";
import { debounce, throttle } from "@goozyshi/tracker-shared";
import type { ClickOptions, DOMEventProperties, UnbindFn } from "./types";

export class ClickManager {
  private tracker: Tracker;
  private bindingMap = new WeakMap<Element, () => void>();

  constructor(tracker: Tracker) {
    this.tracker = tracker;
  }

  bindClick(
    el: Element,
    event: string,
    data: DOMEventProperties,
    options: ClickOptions = {}
  ): UnbindFn {
    const {
      debounce: debounceMs = 0,
      throttle: throttleMs = 0,
      reporters,
    } = options;
    const trackOptions: TrackOptions | undefined = reporters
      ? { reporters }
      : undefined;

    let handler = () => this.tracker.track(event, data ?? {}, trackOptions);
    if (debounceMs > 0) handler = debounce(handler, debounceMs);
    else if (throttleMs > 0) handler = throttle(handler, throttleMs);

    el.addEventListener("click", handler);
    this.bindingMap.set(el, handler);

    return () => {
      el.removeEventListener("click", handler);
      this.bindingMap.delete(el);
    };
  }
}
