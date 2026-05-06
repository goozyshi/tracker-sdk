import type { Tracker } from "@goozyshi/tracker-core";
import type { JSONObject } from "@goozyshi/tracker-shared";
import { ClickManager } from "./dom/click";
import { ExposureManager } from "./dom/exposure";
import type { ClickOptions, ExposureOptions, UnbindFn } from "./dom/types";

export type ExposeBindingOptions = ExposureOptions;
export type ClickBindingOptions = ClickOptions;

export interface ExposeBinding {
  name: string;
  data?: JSONObject;
  options?: ExposeBindingOptions;
}

export interface ClickBinding {
  name: string;
  data?: JSONObject;
  options?: ClickBindingOptions;
}

// biome-ignore lint/suspicious/noExplicitAny: vue 多版本 Directive 接口签名差异，使用 any 兜底
type AnyHook = (...args: any[]) => unknown;
export interface AnyVueDirective {
  created?: AnyHook;
  beforeMount?: AnyHook;
  mounted?: AnyHook;
  beforeUpdate?: AnyHook;
  updated?: AnyHook;
  beforeUnmount?: AnyHook;
  unmounted?: AnyHook;
}

interface InternalBinding<V> {
  value: V | undefined;
}

export interface VueBindings {
  exposeDirective: AnyVueDirective;
  clickDirective: AnyVueDirective;
  useTracker: () => Tracker;
  useTrack: () => (event: string, properties?: JSONObject) => void;
}

export function createVueBindings(tracker: Tracker): VueBindings {
  const click = new ClickManager(tracker);
  const exposure = new ExposureManager(tracker);

  const exposeUnbindMap = new WeakMap<HTMLElement, UnbindFn>();
  const clickUnbindMap = new WeakMap<HTMLElement, UnbindFn>();

  const exposeDirective: AnyVueDirective = {
    mounted(el: HTMLElement, binding: InternalBinding<ExposeBinding>) {
      const { name, data, options } = binding.value ?? { name: "" };
      if (!name) return;
      const unbind = exposure.observe(el, name, data, options ?? {});
      exposeUnbindMap.set(el, unbind);
    },
    unmounted(el: HTMLElement) {
      const unbind = exposeUnbindMap.get(el);
      if (unbind) {
        unbind();
        exposeUnbindMap.delete(el);
      }
    },
  };

  const clickDirective: AnyVueDirective = {
    mounted(el: HTMLElement, binding: InternalBinding<ClickBinding>) {
      const { name, data, options } = binding.value ?? { name: "" };
      if (!name) return;
      const unbind = click.bindClick(el, name, data, options ?? {});
      clickUnbindMap.set(el, unbind);
    },
    unmounted(el: HTMLElement) {
      const unbind = clickUnbindMap.get(el);
      if (unbind) {
        unbind();
        clickUnbindMap.delete(el);
      }
    },
  };

  return {
    exposeDirective,
    clickDirective,
    useTracker: () => tracker,
    useTrack:
      () =>
      (event, properties = {}) =>
        tracker.track(event, properties),
  };
}
