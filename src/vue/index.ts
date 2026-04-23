import type { Directive } from 'vue';
import { clickManager } from '../core/click';
import { exposureManager } from '../core/exposure';
import type {
  ClickOptions,
  EventName,
  ExposureOptions,
  ReporterDataMap,
  TrackOptions,
} from '../core/types';

export interface ExposeBindingOptions extends ExposureOptions {
  reporters?: string[];
  reporterData?: ReporterDataMap;
}

export interface ClickBindingOptions extends ClickOptions {
  reporters?: string[];
  reporterData?: ReporterDataMap;
}

export interface ExposeBinding {
  name: EventName;
  data?: Record<string, unknown>;
  options?: ExposeBindingOptions;
}

export interface ClickBinding {
  name: EventName;
  data?: Record<string, unknown>;
  options?: ClickBindingOptions;
}

type UnbindFn = () => void;

const exposeUnbindMap = new WeakMap<HTMLElement, UnbindFn>();
const clickUnbindMap = new WeakMap<HTMLElement, UnbindFn>();

export const exposeDirective: Directive<HTMLElement, ExposeBinding> = {
  mounted(el, binding) {
    const { name, data, options = {} } = binding.value;
    const { reporters, reporterData, ...exposureOptions } = options;
    const unbind = exposureManager.observe(
      el,
      name,
      data,
      exposureOptions,
      createTrackOptions(reporters, reporterData)
    );
    exposeUnbindMap.set(el, unbind);
  },
  updated(el, binding) {
    const { name, data, options = {} } = binding.value;
    const { reporters, reporterData, ...exposureOptions } = options;
    const once = exposureOptions.once !== false;

    if (once) return;

    const oldUnbind = exposeUnbindMap.get(el);
    if (oldUnbind) {
      oldUnbind();
    }
    exposureManager.reset(el);
    const unbind = exposureManager.observe(
      el,
      name,
      data,
      exposureOptions,
      createTrackOptions(reporters, reporterData)
    );
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
    const { reporters, reporterData, ...clickOptions } = options;
    const unbind = clickManager.bindClick(
      el,
      name,
      data,
      clickOptions,
      createTrackOptions(reporters, reporterData)
    );
    clickUnbindMap.set(el, unbind);
  },
  updated(el, binding) {
    const oldUnbind = clickUnbindMap.get(el);
    if (oldUnbind) {
      oldUnbind();
    }

    const { name, data, options = {} } = binding.value;
    const { reporters, reporterData, ...clickOptions } = options;
    const unbind = clickManager.bindClick(
      el,
      name,
      data,
      clickOptions,
      createTrackOptions(reporters, reporterData)
    );
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

function createTrackOptions(
  reporters?: string[],
  reporterData?: ReporterDataMap
): TrackOptions | undefined {
  if (!reporters && !reporterData) return undefined;
  return {
    reporters,
    reporterData,
  };
}

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
