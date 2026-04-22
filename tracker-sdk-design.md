# Tracker SDK 设计方案

## 1. 整体架构

```
@your/tracker
├── core/           # 框架无关核心
│   ├── tracker.ts
│   └── types.ts
├── vue/            # Vue 适配（指令）
├── react/          # React 适配（Hook）
└── index.ts
```

单包多入口，通过 `peerDependencies` 可选依赖 Vue/React。

## 2. 包导出结构

```json
{
  "name": "@your/tracker",
  "exports": {
    ".": "./dist/index.js",
    "./vue": "./dist/vue/index.js",
    "./react": "./dist/react/index.js"
  },
  "peerDependencies": {
    "vue": ">=3.0.0",
    "react": ">=16.8.0"
  },
  "peerDependenciesMeta": {
    "vue": { "optional": true },
    "react": { "optional": true }
  }
}
```

## 3. 核心接口设计

### 3.1 Reporter 接口

业务方自行实现，SDK 不内置具体平台适配。

```ts
interface Reporter {
  name: string;
  track: (event: string, data?: Record<string, any>) => void | Promise<void>;
  batchTrack?: (events: TrackEvent[]) => void | Promise<void>;
  init?: () => void;
  destroy?: () => void;
}

interface TrackEvent {
  event: string;
  data: Record<string, any>;
  timestamp: number;
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 唯一标识，用于 reporters 筛选 |
| `track` | ✅ | 单条上报，内部做平台格式转换 + 发送 |
| `batchTrack` | ❌ | 批量上报，未实现则 SDK 循环调用 track |
| `init` | ❌ | 初始化钩子 |
| `destroy` | ❌ | 销毁钩子 |

**职责划分**：
- 全局 middleware：通用逻辑（时间戳、用户ID、页面信息）
- Reporter.track：**平台特定格式转换** + 发送方式（fetch/sendBeacon/hybrid）

```ts
// 示例：神策 Reporter
const saReporter: Reporter = {
  name: 'sa',
  track(event, data) {
    sensors.track(event, {
      $time: data?.ts,
      $element_id: data?.elementId,
      ...data,
    });
  },
};

// 示例：使用 sendBeacon
const beaconReporter: Reporter = {
  name: 'beacon',
  track(event, data) {
    navigator.sendBeacon('/api/track', JSON.stringify({ event, ...data }));
  },
};
```

### 3.2 中间件接口

统一的中间件机制，通过 context 对象传递事件和数据。

```ts
interface MiddlewareContext {
  event: string;
  data: Record<string, any>;
}

type Middleware = (ctx: MiddlewareContext, next: () => void) => void;
```

### 3.3 数据提供者

支持静态对象或动态函数，上报时取值。

```ts
type DataProvider = Record<string, any> | (() => Record<string, any>);
```

### 3.4 配置项

```ts
interface TrackerOptions {
  onError?: (err: Error, reporter: string, event: string, data: any) => void;
  retry?: { max: number; delay: number };
  defaultReporters?: string[];  // 默认 reporters，不指定则全部
  batch?: {
    enabled?: boolean;
    maxSize?: number;
    interval?: number;
    flushOnUnload?: boolean;
  };
  offline?: {
    enabled?: boolean;
    storage?: 'localStorage' | 'indexedDB';
    maxSize?: number;
    maxAge?: number;
  };
}
```

### 3.5 单例初始化

单例 `tracker` 通过 `init` 方法配置 `TrackerOptions`，其他配置通过链式方法。

```ts
import { tracker } from '@your/tracker';

tracker
  .init({
    defaultReporters: ['hybrid'],
    batch: { enabled: true, maxSize: 20 },
    offline: { enabled: true },
    onError: (err) => console.error(err),
  })
  .addReporter(consoleReporter)
  .addReporter(hybridReporter)
  .setGlobalData(() => ({ userId: getUserId() }))
  .transform((data) => ({ ...data, ts: Date.now() }));
```

### 3.6 Reporter 分发

支持配置默认 reporters，业务层可覆盖。

```ts
// init 时配置默认
tracker.init({ defaultReporters: ['hybrid'] });

// 使用时覆盖
sendEvent('debug_log', { msg: 'test' }, { reporters: ['console'] });
```

**优先级**：`options.reporters` > `defaultReporters` > 全部 reporters

## 4. Tracker 核心实现

底层统一使用中间件机制，表层提供语法糖简化常见用法。

### 4.1 内置中间件工具函数

```ts
export const withGlobalData = (provider: DataProvider): Middleware =>
  (ctx, next) => {
    const extra = typeof provider === 'function' ? provider() : provider;
    Object.assign(ctx.data, extra);
    next();
  };

export const withTransformer = (fn: (data: any) => any): Middleware =>
  (ctx, next) => {
    ctx.data = fn(ctx.data);
    next();
  };

export const withFilter = (predicate: (event: string, data: any) => boolean): Middleware =>
  (ctx, next) => {
    if (predicate(ctx.event, ctx.data)) next();
  };
```

### 4.2 Tracker 类

```ts
class Tracker {
  private reporters: Reporter[] = [];
  private middlewares: Middleware[] = [];
  private options: TrackerOptions = {};
  private failedQueue: { reporter: string; event: string; data: any; retries: number }[] = [];

  constructor(options?: TrackerOptions) {
    this.options = options || {};
  }

  // ========== Reporter 管理 ==========

  addReporter(reporter: Reporter) {
    reporter.init?.();
    this.reporters.push(reporter);
    return this;
  }

  // ========== 底层：中间件 ==========

  use(fn: Middleware) {
    this.middlewares.push(fn);
    return this;
  }

  // ========== 语法糖 ==========

  setGlobalData(provider: DataProvider) {
    return this.use(withGlobalData(provider));
  }

  transform(fn: (data: any) => any) {
    return this.use(withTransformer(fn));
  }

  filter(predicate: (event: string, data: any) => boolean) {
    return this.use(withFilter(predicate));
  }

  // ========== 核心上报 ==========

  track(event: string, data?: any) {
    const ctx: MiddlewareContext = { event, data: { ...data } };

    let idx = 0;
    const next = () => {
      if (idx < this.middlewares.length) {
        this.middlewares[idx++](ctx, next);
      } else {
        this.dispatch(ctx.event, ctx.data);
      }
    };
    next();
  }

  private dispatch(event: string, data: any) {
    this.reporters.forEach(async (r) => {
      try {
        await r.track(event, data);
      } catch (err) {
        this.handleError(err as Error, r.name, event, data);
      }
    });
  }

  // ========== 错误处理 ==========

  private handleError(err: Error, reporter: string, event: string, data: any) {
    this.options.onError?.(err, reporter, event, data);

    if (this.options.retry) {
      this.failedQueue.push({ reporter, event, data, retries: 0 });
      this.scheduleRetry();
    }
  }

  private scheduleRetry() {
    const { max, delay } = this.options.retry!;

    setTimeout(() => {
      const item = this.failedQueue.shift();
      if (!item || item.retries >= max) return;

      const r = this.reporters.find(r => r.name === item.reporter);
      r?.track(item.event, item.data).catch(() => {
        this.failedQueue.push({ ...item, retries: item.retries + 1 });
      });
    }, delay);
  }

  // ========== 生命周期 ==========

  destroy() {
    this.reporters.forEach(r => r.destroy?.());
    this.reporters = [];
    this.middlewares = [];
    this.failedQueue = [];
  }
}

export const createTracker = (options?: TrackerOptions) => new Tracker(options);
export const tracker = createTracker();
```

### 4.3 API 总览

| 方法 | 类型 | 说明 |
|------|------|------|
| `init(options)` | 配置 | 设置 TrackerOptions |
| `addReporter(r)` | 基础 | 添加上报器 |
| `use(fn)` | 底层 | 添加中间件 |
| `setGlobalData(p)` | 语法糖 | 注入全局数据 |
| `transform(fn)` | 语法糖 | 数据转换 |
| `filter(fn)` | 语法糖 | 条件过滤 |
| `track(e, d)` | 核心 | 触发上报 |
| `destroy()` | 生命周期 | 销毁实例 |

## 5. 事件定义（业务侧）

集中定义，分散调用。

```ts
// tracker/events.ts
export const Events = {
  GIFT_SHOW: 'gift_show',
  USER_LIST_SHOW: 'user_list_show',
  BTN_CLICK: 'btn_click',
} as const;

export interface EventParams {
  [Events.GIFT_SHOW]: { giftId: string };
  [Events.USER_LIST_SHOW]: { listType: 'fans' | 'following' };
  [Events.BTN_CLICK]: { btnId: string };
}

// 类型安全的 track 封装
export function track<E extends keyof EventParams>(event: E, data: EventParams[E]) {
  tracker.track(event, data);
}
```

大型项目可按模块拆分后聚合导出。

## 6. 框架适配

Vue 指令和 React Hook 的完整实现见第 8 节：

- **Vue 指令**：8.5 节
- **React Hook**：8.6 节

## 7. 业务项目接入示例

```ts
// src/tracker/index.ts
import { tracker, type Reporter } from '@your/tracker';
import { getUserId, getAbGroup } from '@/stores';

const consoleReporter: Reporter = {
  name: 'console',
  track(event, data) {
    if (ENV === 'develop') {
      console.log(`[Tracker] ${event}`, data);
    }
  }
};

const hybridReporter: Reporter = {
  name: 'hybrid',
  track(event, data) {
    window.HybridBridge?.report({ event, ...data });
  }
};

tracker
  // 配置 TrackerOptions
  .init({
    defaultReporters: ['hybrid'],
    onError(err, reporter, event) {
      console.error(`[Tracker][${reporter}] ${event} failed:`, err);
    },
    retry: { max: 3, delay: 1000 },
  })
  // 注册上报器
  .addReporter(consoleReporter)
  .addReporter(hybridReporter)
  // 语法糖：全局数据
  .setGlobalData({ appVersion: '1.0.0', platform: 'web' })
  .setGlobalData(() => ({
    userId: getUserId(),
    abGroup: getAbGroup(),
  }))
  // 语法糖：数据转换
  .transform(data => ({
    ...data,
    pageUrl: location.href,
    timestamp: Date.now(),
  }))
  // 语法糖：过滤 debug 事件（生产环境）
  .filter(event => !event.startsWith('debug_'));

export default tracker;
```

## 8. 曝光上报

### 8.1 配置接口

```ts
interface ExposureOptions {
  threshold?: number;       // 曝光比例，默认 0.5（50%可见）
  duration?: number;        // 曝光时间，默认 0（立即），单位 ms
  once?: boolean;           // 是否只曝光一次，默认 true
  groupKey?: string;        // 组合曝光 key，相同 key 合并上报
  groupDelay?: number;      // 组合曝光延迟，默认 100ms
}

interface ClickOptions {
  debounce?: number;        // 防抖，默认 0
  throttle?: number;        // 节流，默认 0
}
```

### 8.2 曝光管理器

```ts
class ExposureManager {
  private observer: IntersectionObserver | null = null;
  private timers = new Map<Element, number>();
  private exposed = new WeakSet<Element>();
  private groups = new Map<string, { event: string; items: any[]; timer: number }>();
  private supportIO = typeof IntersectionObserver !== 'undefined';

  observe(
    el: Element,
    event: string,
    data: any,
    options: ExposureOptions = {}
  ) {
    const { threshold = 0.5, duration = 0, once = true, groupKey, groupDelay = 100 } = options;

    if (once && this.exposed.has(el)) return;

    if (this.supportIO) {
      this.observeWithIO(el, event, data, { threshold, duration, once, groupKey, groupDelay });
    } else {
      this.observeWithScroll(el, event, data, { threshold, duration, once, groupKey, groupDelay });
    }
  }

  private observeWithIO(
    el: Element,
    event: string,
    data: any,
    options: Required<Omit<ExposureOptions, 'groupKey' | 'groupDelay'>> & { groupKey?: string; groupDelay: number }
  ) {
    const { threshold, duration, once, groupKey, groupDelay } = options;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
            if (duration > 0) {
              const timer = window.setTimeout(() => {
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

    return () => {
      observer.unobserve(el);
      observer.disconnect();
    };
  }

  private observeWithScroll(
    el: Element,
    event: string,
    data: any,
    options: Required<Omit<ExposureOptions, 'groupKey' | 'groupDelay'>> & { groupKey?: string; groupDelay: number }
  ) {
    const { threshold, duration, once, groupKey, groupDelay } = options;

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
            const timer = window.setTimeout(() => {
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

    checkVisibility();

    return () => {
      window.removeEventListener('scroll', throttledCheck);
      window.removeEventListener('resize', throttledCheck);
    };
  }

  private handleExposure(
    el: Element,
    event: string,
    data: any,
    once: boolean,
    groupKey?: string,
    groupDelay = 100
  ) {
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

  private addToGroup(key: string, event: string, data: any, delay: number) {
    const group = this.groups.get(key);

    if (group) {
      clearTimeout(group.timer);
      group.items.push(data);
    } else {
      this.groups.set(key, { event, items: [data], timer: 0 });
    }

    const g = this.groups.get(key)!;
    g.timer = window.setTimeout(() => {
      tracker.track(g.event, { items: g.items, count: g.items.length });
      this.groups.delete(key);
    }, delay);
  }

  reset(el?: Element) {
    if (el) {
      this.exposed.delete(el);
    } else {
      this.exposed = new WeakSet();
    }
  }

  destroy() {
    this.timers.forEach((t) => {clearTimeout(t)});
    this.timers.clear();
    this.groups.forEach((g) => {clearTimeout(g.timer)});
    this.groups.clear();
  }
}

export const exposureManager = new ExposureManager();
```

### 8.3 点击管理器

```ts
class ClickManager {
  private bindingMap = new WeakMap<Element, () => void>();

  bindClick(
    el: Element,
    event: string,
    data: any,
    options: ClickOptions = {}
  ) {
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
```

### 8.4 工具函数

```ts
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: number;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  }) as T;
}

function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let last = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  }) as T;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 8.5 Vue 指令

拆分为 `v-expose` 和 `v-click` 两个语义化指令。

```ts
// vue/index.ts
import type { Directive } from 'vue';
import { exposureManager, clickManager } from '../core';

interface ExposeBinding {
  name: string;
  data?: Record<string, any>;
  reporters?: string[];       // 指定 reporters，覆盖默认
  threshold?: number;
  duration?: number;
  once?: boolean;
  groupKey?: string;
  groupDelay?: number;
}

interface ClickBinding {
  name: string;
  data?: Record<string, any>;
  reporters?: string[];       // 指定 reporters，覆盖默认
  debounce?: number;
  throttle?: number;
}

export const exposeDirective: Directive<HTMLElement, ExposeBinding> = {
  mounted(el, binding) {
    const { name, data, reporters, threshold, duration, once, groupKey, groupDelay } = binding.value;
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    exposureManager.observe(el, name, finalData, { threshold, duration, once, groupKey, groupDelay });
  },
  unmounted(el) {
    exposureManager.reset(el);
  }
};

export const clickDirective: Directive<HTMLElement, ClickBinding> = {
  mounted(el, binding) {
    const { name, data, reporters, debounce, throttle } = binding.value;
    const finalData = reporters ? { ...data, _reporters: reporters } : data;
    clickManager.bindClick(el, name, finalData, { debounce, throttle });
  },
  unmounted(el) {
    // clickManager 使用 WeakMap，无需手动清理
  }
};

// 注册
// app.directive('expose', exposeDirective);
// app.directive('click', clickDirective);

// 使用示例
// <div v-expose="{ name: 'card_show', data: { id: 1 } }">
// <div v-expose="{ name: 'card_show', data: { id: 1 }, duration: 1500 }">
// <button v-click="{ name: 'btn_click', data: { id: 1 } }">
// <button v-click="{ name: 'btn_click', data: { id: 1 }, throttle: 300 }">

// 指定 reporters
// <div v-expose="{ name: 'debug_show', data: { id: 1 }, reporters: ['console'] }">
// <button v-click="{ name: 'debug_click', data: { id: 1 }, reporters: ['console'] }">

// 组合曝光
// <div 
//   v-for="item in list" 
//   v-expose="{ 
//     name: 'list_exposure', 
//     data: { id: item.id, name: item.name },
//     groupKey: 'user-list',
//     groupDelay: 200
//   }"
// >
```

### 8.6 React Hook

```ts
// react/index.ts
import { useRef, useEffect, useCallback } from 'react';
import { exposureManager, clickManager } from '../core';

interface UseExposureOptions {
  reporters?: string[];       // 指定 reporters，覆盖默认
  threshold?: number;
  duration?: number;
  once?: boolean;
  groupKey?: string;
  groupDelay?: number;
}

export function useExposure(
  event: string,
  data?: any,
  options: UseExposureOptions = {}
) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    exposureManager.observe(el, event, data, options);

    return () => exposureManager.reset(el);
  }, [event, JSON.stringify(data), JSON.stringify(options)]);

  return ref;
}

interface UseClickOptions {
  reporters?: string[];       // 指定 reporters，覆盖默认
  debounce?: number;
  throttle?: number;
}

export function useClick(
  event: string,
  data?: any,
  options: UseClickOptions = {}
) {
  const { debounce: debounceMs = 0, throttle: throttleMs = 0 } = options;

  return useCallback(() => {
    tracker.track(event, data);
  }, [event, data]);
}

// 使用示例
// const exposureRef = useExposure('card_show', { id: 1 }, { 
//   threshold: 0.5, 
//   duration: 1500 
// });
// <div ref={exposureRef}>

// 指定 reporters
// const debugRef = useExposure('debug_show', { id: 1 }, { reporters: ['console'] });
// const handleClick = useClick('debug_click', { id: 1 }, { reporters: ['console'] });

// 组合曝光
// {list.map(item => {
//   const ref = useExposure('list_exposure', { id: item.id }, { 
//     groupKey: 'user-list',
//     groupDelay: 200 
//   });
//   return <div ref={ref} key={item.id}>{item.name}</div>;
// })}
```

### 8.7 组合曝光上报数据结构

```ts
// 单独曝光：10 个 item 各上报 1 次
tracker.track('item_show', { id: '1', name: 'a' });
tracker.track('item_show', { id: '2', name: 'b' });
// ...共 10 次

// 组合曝光：合并为 1 次
tracker.track('list_exposure', {
  items: [
    { id: '1', name: 'a' },
    { id: '2', name: 'b' },
    // ...
  ],
  count: 10
});
```

### 8.8 命令式 API

命令式场景用户已知调用时机，只需一个通用上报函数。

```ts
// core/api.ts
import { tracker } from './tracker';

interface SendEventOptions {
  reporters?: string[];
}

export function sendEvent(
  event: string, 
  data?: Record<string, any>,
  options?: SendEventOptions
) {
  const finalData = options?.reporters 
    ? { ...data, _reporters: options.reporters }
    : data;
  tracker.track(event, finalData);
}
```

### 8.9 使用示例

```ts
import { sendEvent } from '@your/tracker';

// 默认（走 defaultReporters）
sendEvent('page_view', { page: 'home' });

// 指定 reporters
sendEvent('debug_log', { msg: 'test' }, { reporters: ['console'] });
sendEvent('critical_event', { id: 1 }, { reporters: ['hybrid', 'console'] });

// 手动曝光（组件挂载时）
onMounted(() => {
  sendEvent('card_show', { id: 1 });
});

// 手动点击（事件处理函数中）
const handleClick = () => {
  sendEvent('btn_click', { id: 1 });
};
```

### 8.10 导出结构

```ts
// @your/tracker - 核心
export {
  createTracker,
  tracker,
  sendEvent,
  type Reporter,
  type Middleware,
  type ExposureOptions,
  type ClickOptions,
};

// @your/tracker/vue
export { exposeDirective, clickDirective };

// @your/tracker/react
export { useExposure, useClick };
```

| 层级 | API | 说明 |
|------|-----|------|
| 命令式 | `sendEvent(name, data)` | 手动调用，已知时机 |
| 声明式 Vue | `v-expose` / `v-click` | 自动绑定 DOM |
| 声明式 React | `useExposure` / `useClick` | Hook 绑定 |
| 内部 | `exposureManager` / `clickManager` | 指令/Hook 内部使用 |

### 8.11 不同平台格式适配

API 层保持简洁统一，平台差异在 transformer 处理。

```ts
const tracker = createTracker()
  .addReporter(sensorsReporter)
  .transform((data) => ({
    ...data,
    // 神策要求的字段名
    $time: data.timestamp,
    $screen_width: window.innerWidth,
  }));

// 业务调用不变
track('page_view', { page: 'home' });
```

## 9. 批量上报 & 离线存储

### 9.1 整体流程

```
track() → 实时上报 → 成功 ✓
                  → 失败 → 加入内存队列
                              ↓
                         定时批量上报 ← 合并多条
                              ↓
                         失败 → 持久化 localStorage
                              ↓
                         网络恢复 / 下次启动 → 空闲时补发
```

### 9.2 批量管理器

```ts
class BatchManager {
  private queue: TrackEvent[] = [];
  private timer: number | null = null;
  private options: Required<BatchOptions>;

  constructor(options: BatchOptions = {}) {
    this.options = {
      enabled: false,
      maxSize: 20,
      interval: 5000,
      flushOnUnload: true,
      ...options,
    };

    if (this.options.enabled) {
      this.startTimer();
      if (this.options.flushOnUnload) {
        this.bindUnload();
      }
    }
  }

  add(event: string, data: any) {
    this.queue.push({ event, data, timestamp: Date.now() });
    if (this.queue.length >= this.options.maxSize) {
      this.flush();
    }
  }

  async flush() {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, this.options.maxSize);
    try {
      await this.sendBatch(batch);
    } catch {
      offlineManager.saveAll(batch);
    }
  }

  async sendBatch(batch: TrackEvent[]) {
    for (const reporter of reporters) {
      if (reporter.batchTrack) {
        await reporter.batchTrack(batch);
      } else {
        for (const item of batch) {
          await reporter.track(item.event, item.data);
        }
      }
    }
  }

  private startTimer() {
    this.timer = window.setInterval(() => this.flush(), this.options.interval);
  }

  private bindUnload() {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushSync();
      }
    });
  }

  private flushSync() {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0);
    const data = JSON.stringify({ events: batch });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track/batch', data);
    } else {
      offlineManager.saveAll(batch);
    }
  }
}
```

### 9.3 离线管理器

```ts
class OfflineManager {
  private key = 'tracker_offline';
  private options: Required<OfflineOptions>;

  constructor(options: OfflineOptions = {}) {
    this.options = {
      enabled: false,
      storage: 'localStorage',
      maxSize: 200,
      maxAge: 7 * 24 * 60 * 60,
      ...options,
    };
    if (this.options.enabled) {
      this.bindOnline();
      this.flushOnStart();
    }
  }

  saveAll(events: TrackEvent[]) {
    if (!this.options.enabled) return;
    const stored = this.load();
    stored.push(...events);
    while (stored.length > this.options.maxSize) {
      stored.shift();
    }
    localStorage.setItem(this.key, JSON.stringify(stored));
  }

  private load(): TrackEvent[] {
    try {
      return JSON.parse(localStorage.getItem(this.key) || '[]');
    } catch {
      return [];
    }
  }

  private bindOnline() {
    window.addEventListener('online', () => {
      requestIdleCallback(() => this.flush(), { timeout: 10000 });
    });
  }

  private flushOnStart() {
    setTimeout(() => {
      requestIdleCallback(() => this.flush(), { timeout: 10000 });
    }, 3000);
  }

  private async flush() {
    const stored = this.load();
    if (!stored.length) return;

    const now = Date.now();
    const valid = stored.filter(
      item => now - item.timestamp < this.options.maxAge * 1000
    );
    if (!valid.length) {
      localStorage.removeItem(this.key);
      return;
    }

    const batches = chunk(valid, 20);
    for (const batch of batches) {
      try {
        await batchManager.sendBatch(batch);
        await sleep(1000);
      } catch {
        const remaining = batches.slice(batches.indexOf(batch)).flat();
        localStorage.setItem(this.key, JSON.stringify(remaining));
        return;
      }
    }
    localStorage.removeItem(this.key);
  }
}
```

### 9.4 使用示例

```ts
const tracker = createTracker({
  batch: {
    enabled: true,
    maxSize: 20,
    interval: 5000,
  },
  offline: {
    enabled: true,
    maxSize: 200,
    maxAge: 7 * 24 * 60 * 60,
  },
});
```

## 10. 待补充

- [ ] 调试模式
- [ ] 采样率控制（可用 filter 中间件实现）
- [ ] 单元测试方案
