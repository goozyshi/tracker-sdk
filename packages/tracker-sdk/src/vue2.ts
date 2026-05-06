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

// biome-ignore lint/suspicious/noExplicitAny: vue2 DirectiveOptions 跨版本签名差异，使用 any 兜底
type AnyHook = (...args: any[]) => unknown;
export interface AnyVue2Directive {
  bind?: AnyHook;
  inserted?: AnyHook;
  update?: AnyHook;
  componentUpdated?: AnyHook;
  unbind?: AnyHook;
}

interface InternalBinding<V> {
  value: V | undefined;
}

export interface Vue2Bindings {
  exposeDirective: AnyVue2Directive;
  clickDirective: AnyVue2Directive;
  useTracker: () => Tracker;
}

export function createVue2Bindings(tracker: Tracker): Vue2Bindings {
  const click = new ClickManager(tracker);
  const exposure = new ExposureManager(tracker);

  const exposeUnbindMap = new WeakMap<HTMLElement, UnbindFn>();
  const clickUnbindMap = new WeakMap<HTMLElement, UnbindFn>();

  const exposeDirective: AnyVue2Directive = {
    bind(el: HTMLElement, binding: InternalBinding<ExposeBinding>) {
      const { name, data, options } = binding.value ?? { name: "" };
      if (!name) return;
      const unbind = exposure.observe(el, name, data, options ?? {});
      exposeUnbindMap.set(el, unbind);
    },
    unbind(el: HTMLElement) {
      const unbind = exposeUnbindMap.get(el);
      if (unbind) {
        unbind();
        exposeUnbindMap.delete(el);
      }
    },
  };

  const clickDirective: AnyVue2Directive = {
    bind(el: HTMLElement, binding: InternalBinding<ClickBinding>) {
      const { name, data, options } = binding.value ?? { name: "" };
      if (!name) return;
      const unbind = click.bindClick(el, name, data, options ?? {});
      clickUnbindMap.set(el, unbind);
    },
    unbind(el: HTMLElement) {
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
  };
}
