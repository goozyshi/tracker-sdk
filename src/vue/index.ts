import type { Directive } from 'vue';
import { exposureManager } from '../core/exposure';
import { clickManager } from '../core/click';
import type { ExposureOptions, ClickOptions, EventName } from '../core/types';

export interface ExposeBinding {
  name: EventName;
  data?: Record<string, any>;
  reporters?: string[];
  threshold?: number;
  duration?: number;
  once?: boolean;
  groupKey?: string;
  groupDelay?: number;
}

export interface ClickBinding {
  name: EventName;
  data?: Record<string, any>;
  reporters?: string[];
  debounce?: number;
  throttle?: number;
}

type UnbindFn = () => void;

const exposeUnbindMap = new WeakMap<HTMLElement, UnbindFn>();
const clickUnbindMap = new WeakMap<HTMLElement, UnbindFn>();

export const exposeDirective: Directive<HTMLElement, ExposeBinding> = {
  mounted(el, binding) {
    const { name, data, reporters, threshold, duration, once, groupKey, groupDelay } = binding.value;
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    const options: ExposureOptions = { threshold, duration, once, groupKey, groupDelay };
    const unbind = exposureManager.observe(el, name, finalData, options);
    exposeUnbindMap.set(el, unbind);
  },
  updated(el, binding) {
    const oldUnbind = exposeUnbindMap.get(el);
    if (oldUnbind) {
      oldUnbind();
    }

    const { name, data, reporters, threshold, duration, once, groupKey, groupDelay } = binding.value;
    if (!once) {
      exposureManager.reset(el);
    }
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    const options: ExposureOptions = { threshold, duration, once, groupKey, groupDelay };
    const unbind = exposureManager.observe(el, name, finalData, options);
    exposeUnbindMap.set(el, unbind);
  },
  unmounted(el) {
    const unbind = exposeUnbindMap.get(el);
    if (unbind) {
      unbind();
      exposeUnbindMap.delete(el);
    }
    exposureManager.reset(el);
  },
};

export const clickDirective: Directive<HTMLElement, ClickBinding> = {
  mounted(el, binding) {
    const { name, data, reporters, debounce, throttle } = binding.value;
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    const options: ClickOptions = { debounce, throttle };
    const unbind = clickManager.bindClick(el, name, finalData, options);
    clickUnbindMap.set(el, unbind);
  },
  updated(el, binding) {
    const oldUnbind = clickUnbindMap.get(el);
    if (oldUnbind) {
      oldUnbind();
    }

    const { name, data, reporters, debounce, throttle } = binding.value;
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    const options: ClickOptions = { debounce, throttle };
    const unbind = clickManager.bindClick(el, name, finalData, options);
    clickUnbindMap.set(el, unbind);
  },
  unmounted(el) {
    const unbind = clickUnbindMap.get(el);
    if (unbind) {
      unbind();
      clickUnbindMap.delete(el);
    }
  },
};

export default { exposeDirective, clickDirective };

declare module 'vue' {
  interface ComponentCustomProperties {
    vExpose: typeof exposeDirective;
    vClick: typeof clickDirective;
  }
}

declare module '@vue/runtime-core' {
  interface GlobalDirectives {
    vExpose: typeof exposeDirective;
    vClick: typeof clickDirective;
  }
}
