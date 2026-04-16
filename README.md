# Tracker SDK

框架无关的埋点 SDK，支持 Vue 指令 / React Hook / 命令式 API。

## 安装

```bash
npm install @anthropic/tracker
```

## 初始化

```ts
import { tracker, type Reporter } from '@anthropic/tracker';

const consoleReporter: Reporter = {
  name: 'console',
  track(event, data) {
    console.log(`[Track] ${event}`, data);
  },
};

const hybridReporter: Reporter = {
  name: 'hybrid',
  track(event, data) {
    window.HybridBridge?.report({ event, ...data });
  },
};

tracker
  .init({
    defaultReporters: ['hybrid'],
    batch: { enabled: true, maxSize: 20, interval: 5000 },
    offline: { enabled: true },
    onError: (err, reporter, event) => console.error(err),
  })
  .addReporter(consoleReporter)
  .addReporter(hybridReporter)
  .setGlobalData({ appVersion: '1.0.0' })
  .setGlobalData(() => ({ userId: getUserId() }))
  .transform((data) => ({ ...data, ts: Date.now() }))
  .filter((event) => !event.startsWith('debug_'));
```

## TrackerOptions

| 字段 | 类型 | 说明 |
|------|------|------|
| `defaultReporters` | `string[]` | 默认 reporters，不指定则全部 |
| `batch` | `BatchOptions` | 批量上报配置 |
| `offline` | `OfflineOptions` | 离线存储配置 |
| `onError` | `Function` | 错误回调 |
| `retry` | `{ max, delay }` | 重试配置 |

## Vue 指令

```ts
// main.ts
import { exposeDirective, clickDirective } from '@anthropic/tracker/vue';

app.directive('expose', exposeDirective);
app.directive('click', clickDirective);
```

### v-expose

```vue
<div v-expose="{ name: 'banner_expose', data: { id: 1 } }">Banner</div>

<!-- 完整配置 -->
<div v-expose="{
  name: 'banner_expose',
  data: { id: 1 },
  threshold: 0.5,
  duration: 1000,
  once: true,
  reporters: ['hybrid']
}">Banner</div>

<!-- 列表分组上报 -->
<div
  v-for="item in list"
  v-expose="{
    name: 'list_expose',
    data: { id: item.id },
    groupKey: 'list',
    groupDelay: 200
  }"
>{{ item.name }}</div>
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | `string` | - | 事件名 |
| `data` | `object` | - | 事件数据 |
| `threshold` | `number` | `0.5` | 可见比例 |
| `duration` | `number` | `0` | 曝光时长 (ms) |
| `once` | `boolean` | `true` | 仅上报一次 |
| `groupKey` | `string` | - | 分组 key |
| `groupDelay` | `number` | `100` | 分组延迟 (ms) |
| `reporters` | `string[]` | - | 指定 reporters |

### v-click

```vue
<button v-click="{ name: 'btn_click', data: { id: 'buy' } }">购买</button>

<!-- 防抖/节流 -->
<button v-click="{ name: 'btn_click', data: { id: 'buy' }, debounce: 300 }">购买</button>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 事件名 |
| `data` | `object` | 事件数据 |
| `debounce` | `number` | 防抖 (ms) |
| `throttle` | `number` | 节流 (ms) |
| `reporters` | `string[]` | 指定 reporters |

## React Hook

```tsx
import { useExposure, useClick } from '@anthropic/tracker/react';

function Banner() {
  const ref = useExposure<HTMLDivElement>('banner_expose', { id: 1 }, {
    threshold: 0.5,
    duration: 1000,
    once: true,
  });

  return <div ref={ref}>Banner</div>;
}

function Button() {
  const handleClick = useClick('btn_click', { id: 'buy' }, { debounce: 300 });

  return <button onClick={handleClick}>购买</button>;
}
```

### useExposure

```ts
const ref = useExposure<T>(event, data?, options?);
```

返回 `RefObject<T>`，绑定到目标元素。

### useClick

```ts
const handler = useClick(event, data?, options?);
```

返回点击处理函数。

## 命令式 API

```ts
import { sendEvent } from '@anthropic/tracker';

sendEvent('page_view', { page: 'home' });

sendEvent('debug_log', { msg: 'test' }, { reporters: ['console'] });
```

## Reporter 实现

```ts
import type { Reporter } from '@anthropic/tracker';

const saReporter: Reporter = {
  name: 'sa',
  track(event, data) {
    sensors.track(event, {
      $time: data?.ts,
      ...data,
    });
  },
  batchTrack(events) {
    sensors.batchSend(events);
  },
};
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 唯一标识 |
| `track` | ✅ | 单条上报 |
| `batchTrack` | ❌ | 批量上报 |
| `init` | ❌ | 初始化钩子 |
| `destroy` | ❌ | 销毁钩子 |

## 最佳实践

### 集中管理埋点名（带类型提示）

```ts
// src/tracker/events.ts
declare module '@anthropic/tracker' {
  interface EventRegistry {
    page_view: true;
    banner_expose: true;
    banner_click: true;
    purchase: true;
  }
}

export {};
```

在项目入口引入一次：

```ts
// main.ts
import './tracker/events';
```

使用时自动提示，无需 import：

```vue
<template>
  <!-- name 字段会有 'page_view' | 'banner_expose' | ... 提示 -->
  <div v-expose="{ name: 'banner_expose', data: { id: 1 } }">Banner</div>
</template>
```

```ts
sendEvent('page_view', { page: 'home' });
```

### 统一参数类型

```ts
// src/tracker/params.ts
import type { Events } from './events';

export interface EventParams {
  [Events.PAGE_VIEW]: { page: string };
  [Events.BANNER_EXPOSE]: { id: number; position?: string };
  [Events.PURCHASE]: { orderId: string; amount: number };
}
```

```ts
// 类型安全的 sendEvent
import { sendEvent } from '@anthropic/tracker';
import { Events, type EventParams } from '@/tracker';

function trackEvent<K extends keyof EventParams>(
  event: K,
  data: EventParams[K]
) {
  sendEvent(event, data);
}

trackEvent(Events.PURCHASE, { orderId: '123', amount: 99 });
```

### 项目结构

```
src/tracker/
├── index.ts        # 初始化配置
├── events.ts       # 埋点名常量
├── params.ts       # 参数类型
└── reporters/      # Reporter 实现
    ├── sa.ts
    └── hybrid.ts
```

## 类型导出

```ts
import type {
  Reporter,
  TrackerOptions,
  ExposureOptions,
  ClickOptions,
  SendEventOptions,
  TrackEvent,
  Middleware,
  DataProvider,
  TransformFn,
  FilterFn,
  UnbindFn,
} from '@anthropic/tracker';
```
