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

export const exposeDirective = {
  bind(el: HTMLElement, binding: { value: ExposeBinding }) {
    const { name, data, options = {} } = binding.value;
    const { reporters, ...exposureOptions } = options;
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    const unbind = exposureManager.observe(el, name, finalData, exposureOptions);
    exposeUnbindMap.set(el, unbind);
  },
  update(el: HTMLElement, binding: { value: ExposeBinding }) {
    const oldUnbind = exposeUnbindMap.get(el);
    if (oldUnbind) {
      oldUnbind();
    }

    const { name, data, options = {} } = binding.value;
    const { reporters, ...exposureOptions } = options;
    if (!exposureOptions.once) {
      exposureManager.reset(el);
    }
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    const unbind = exposureManager.observe(el, name, finalData, exposureOptions);
    exposeUnbindMap.set(el, unbind);
  },
  unbind(el: HTMLElement) {
    const unbind = exposeUnbindMap.get(el);
    if (unbind) {
      unbind();
      exposeUnbindMap.delete(el);
    }
    exposureManager.reset(el);
  },
};

export const clickDirective = {
  bind(el: HTMLElement, binding: { value: ClickBinding }) {
    const { name, data, options = {} } = binding.value;
    const { reporters, ...clickOptions } = options;
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    const unbind = clickManager.bindClick(el, name, finalData, clickOptions);
    clickUnbindMap.set(el, unbind);
  },
  update(el: HTMLElement, binding: { value: ClickBinding }) {
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
  unbind(el: HTMLElement) {
    const unbind = clickUnbindMap.get(el);
    if (unbind) {
      unbind();
      clickUnbindMap.delete(el);
    }
  },
};

export default { exposeDirective, clickDirective };
