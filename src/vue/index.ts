import type { Directive } from 'vue';
import { clickManager } from '../core/click';
import { exposureManager } from '../core/exposure';
import type { ClickOptions, EventName, ExposureOptions } from '../core/types';

export interface ExposeBindingOptions extends ExposureOptions {
  reporters?: string[];
}

export interface ClickBindingOptions extends ClickOptions {
  reporters?: string[];
}

export interface ExposeBinding {
  name: EventName;
  data?: Record<string, any>;
  options?: ExposeBindingOptions;
}

export interface ClickBinding {
  name: EventName;
  data?: Record<string, any>;
  options?: ClickBindingOptions;
}

type UnbindFn = () => void;

const exposeUnbindMap = new WeakMap<HTMLElement, UnbindFn>();
const clickUnbindMap = new WeakMap<HTMLElement, UnbindFn>();

export const exposeDirective: Directive<HTMLElement, ExposeBinding> = {
  mounted(el, binding) {
    const { name, data, options = {} } = binding.value;
    const { reporters, ...exposureOptions } = options;
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    const unbind = exposureManager.observe(el, name, finalData, exposureOptions);
    exposeUnbindMap.set(el, unbind);
  },
  updated(el, binding) {
    const oldUnbind = exposeUnbindMap.get(el);
    if (oldUnbind) {
      oldUnbind();
    }

    const { name, data, options = {} } = binding.value;
    const { reporters, ...exposureOptions } = options;
    if (exposureOptions.once === false) {
      exposureManager.reset(el);
    }
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    const unbind = exposureManager.observe(el, name, finalData, exposureOptions);
    exposeUnbindMap.set(el, unbind);
  },
  unmounted(el, binding) {
    const unbind = exposeUnbindMap.get(el);
    if (unbind) {
      unbind();
      exposeUnbindMap.delete(el);
    }
    if (binding.value?.options?.once === false) {
      exposureManager.reset(el);
    }
  },
};

export const clickDirective: Directive<HTMLElement, ClickBinding> = {
  mounted(el, binding) {
    const { name, data, options = {} } = binding.value;
    const { reporters, ...clickOptions } = options;
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    const unbind = clickManager.bindClick(el, name, finalData, clickOptions);
    clickUnbindMap.set(el, unbind);
  },
  updated(el, binding) {
    const oldUnbind = clickUnbindMap.get(el);
    if (oldUnbind) {
      oldUnbind();
    }

    const { name, data, options = {} } = binding.value;
    const { reporters, ...clickOptions } = options;
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    const unbind = clickManager.bindClick(el, name, finalData, clickOptions);
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
