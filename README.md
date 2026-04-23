# Tracker SDK

框架无关的埋点 SDK，支持 Vue 指令 / React Hook / 命令式 API。

## 安装

```bash
# npm
npm i @goozyshi/tracker-sdk

# pnpm
pnpm add @goozyshi/tracker-sdk

# yarn
yarn add @goozyshi/tracker-sdk
```

## 接入方式

### ESM

```ts
import { tracker, sendEvent } from "@goozyshi/tracker-sdk";
import { exposeDirective, clickDirective } from "@goozyshi/tracker-sdk/vue";
import { useExposure, useClick } from "@goozyshi/tracker-sdk/react";
```

### CJS

```js
const { tracker, sendEvent } = require("@goozyshi/tracker-sdk");
const { exposeDirective } = require("@goozyshi/tracker-sdk/vue");
const { useExposure } = require("@goozyshi/tracker-sdk/react");
```

### CDN

通过 `<script>` 引入后，会挂载到全局变量 `TrackerSDK`（仅核心，不含 Vue/React 适配层）。

```html
<!-- unpkg -->
<script src="https://unpkg.com/@goozyshi/tracker-sdk"></script>

<!-- jsDelivr -->
<script src="https://cdn.jsdelivr.net/npm/@goozyshi/tracker-sdk"></script>

<!-- 锁定版本 -->
<script src="https://unpkg.com/@goozyshi/tracker-sdk@1.2.1/dist/tracker-sdk.min.js"></script>

<script>
  const { tracker, sendEvent } = TrackerSDK;
  tracker.init({ /* ... */ });
  sendEvent("page_view", { page: "home" });
</script>
```

## 初始化

SDK 默认导出**全局单例** `tracker`，跨模块共享，直接 `import` 即用。开启 `batch` / `offline` / `retry` 等能力时需先显式调用一次 `tracker.init(options)`。

```ts
import { tracker, createHttpReporter, type Reporter } from "@goozyshi/tracker-sdk";

const consoleReporter: Reporter = {
  name: "console",
  track(event, data) {
    console.log(`[Track] ${event}`, data);
  },
};

tracker
  .init({
    defaultReporters: ["http"],
    batch: { enabled: true, maxSize: 20, interval: 5000 },
    offline: { enabled: true },
    onError: (err, reporter, event) => console.error(err),
  })
  .addReporter(
    createHttpReporter({
      name: "http",
      url: "https://log.example.com/collect",
      batchTransform: (events) => ({ batch: events }),
    })
  )
  .addReporter(consoleReporter)
  .setGlobalData({ appVersion: "1.0.0" })
  .setGlobalData(() => ({ userId: getUserId() }))
  .setReporterGlobalData("http", () => ({ traceId: getTraceId() }))
  .transform((data) => ({ ...data, ts: Date.now() }))
  .filter((event) => !event.startsWith("debug_"));
```

`setGlobalData()` 注入的是**所有 reporter 共享**的数据。  
`setReporterGlobalData(name, provider)` 注入的是**指定 reporter 独享**的数据。

`tracker.init({ middlewareReporter })` 会自动注册内置数据中台 reporter，固定名称为 `middleware`。

> 需要多个隔离实例（如主站 + 子应用上报到不同后端）时，用 `createTracker(options)` 显式创建。

## TrackerOptions


| 字段                 | 类型               | 说明                  |
| ------------------ | ---------------- | ------------------- |
| `defaultReporters` | `string[]`       | 默认 reporters，不指定则全部 |
| `batch`            | `BatchOptions`   | 批量上报配置              |
| `offline`          | `OfflineOptions` | 离线存储配置              |
| `middlewareReporter` | `MiddlewareReporterOptions` | 自动注册内置数据中台 reporter |
| `onError`          | `Function`       | 错误回调                |
| `retry`            | `{ max, delay }` | 重试配置                |


## Vue 指令

### Vue 3

```ts
import { exposeDirective, clickDirective } from "@goozyshi/tracker-sdk/vue";

app.directive("expose", exposeDirective);
app.directive("click", clickDirective);
```

### Vue 2

```ts
import Vue from "vue";
import { exposeDirective, clickDirective } from "@goozyshi/tracker-sdk/vue2";

Vue.directive("expose", exposeDirective);
Vue.directive("click", clickDirective);
```

### v-expose

```vue
<div v-expose="{ name: 'banner_expose', data: { id: 1 } }">Banner</div>

<!-- 完整配置 -->
<div
  v-expose="{
    name: 'banner_expose',
    data: { id: 1 },
    options: {
      threshold: 0.5,
      duration: 1000,
      once: true,
      reporters: ['hybrid'],
    },
  }"
>Banner</div>

<!-- 列表分组上报 -->
<div
  v-for="item in list"
  v-expose="{
    name: 'list_expose',
    data: { id: item.id },
    options: { groupKey: 'list', groupDelay: 200 },
  }"
>{{ item.name }}</div>
```


| 参数        | 类型                     | 说明   |
| --------- | ---------------------- | ---- |
| `name`    | `string`               | 事件名  |
| `data`    | `object`               | 事件数据 |
| `options` | `ExposeBindingOptions` | 曝光配置 |


`options` 字段：


| 参数           | 类型         | 默认值    | 说明           |
| ------------ | ---------- | ------ | ------------ |
| `threshold`  | `number`   | `0.5`  | 可见比例         |
| `duration`   | `number`   | `0`    | 曝光时长 (ms)    |
| `once`       | `boolean`  | `true` | 仅上报一次        |
| `groupKey`   | `string`   | -      | 分组 key       |
| `groupDelay` | `number`   | `100`  | 分组延迟 (ms)    |
| `reporters`  | `string[]` | -      | 指定 reporters |


### v-click

```vue
<button v-click="{ name: 'btn_click', data: { id: 'buy' } }">购买</button>

<!-- 防抖/节流 -->
<button
  v-click="{
    name: 'btn_click',
    data: { id: 'buy' },
    options: { debounce: 300 },
  }"
>购买</button>
```


| 参数        | 类型                    | 说明   |
| --------- | --------------------- | ---- |
| `name`    | `string`              | 事件名  |
| `data`    | `object`              | 事件数据 |
| `options` | `ClickBindingOptions` | 点击配置 |


`options` 字段：


| 参数          | 类型         | 说明           |
| ----------- | ---------- | ------------ |
| `debounce`  | `number`   | 防抖 (ms)      |
| `throttle`  | `number`   | 节流 (ms)      |
| `reporters` | `string[]` | 指定 reporters |


## React Hook

```tsx
import { useExposure, useClick } from "@goozyshi/tracker-sdk/react";

function Banner() {
  const ref = useExposure<HTMLDivElement>(
    "banner_expose",
    { id: 1 },
    {
      threshold: 0.5,
      duration: 1000,
      once: true,
    }
  );

  return <div ref={ref}>Banner</div>;
}

function Button() {
  const handleClick = useClick("btn_click", { id: "buy" }, { debounce: 300 });

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
import { sendEvent } from "@goozyshi/tracker-sdk";

sendEvent("page_view", { page: "home" });

sendEvent("debug_log", { msg: "test" }, { reporters: ["console"] });

sendEvent(
  "purchase",
  { orderId: "123", amount: 99 },
  {
    reporters: ["http", "console"],
    reporterData: {
      http: {
        publicInfo: { page: location.pathname },
      },
    },
  }
);
```

### Reporter 数据隔离

- `setGlobalData()`：所有 reporter 共享
- `setReporterGlobalData(name, provider)`：指定 reporter 共享
- `sendEvent(event, data, { reporterData })`：指定 reporter 的单次私有数据

```ts
tracker
  .addReporter(httpReporter)
  .addReporter(consoleReporter)
  .setGlobalData(() => ({ userId: getUserId() }))
  .setReporterGlobalData("http", () => ({
    traceId: getTraceId(),
    publicInfo: { platform: "web" },
  }));

sendEvent(
  "buy_click",
  { skuId: 1 },
  {
    reporters: ["http", "console"],
    reporterData: {
      http: {
        publicInfo: { page: "/detail" },
      },
    },
  }
);
```

上面这次事件里：

- `console` 只能拿到 `{ skuId: 1 }` 和共享全局数据
- `http` 额外能拿到自己的 `traceId` / `publicInfo`

SDK 会按 reporter 隔离 `data` 和 `privateData`，某个 reporter 内部修改入参，不会影响其他 reporter。

## 内置 HTTP Reporter

多数场景无需手写 Reporter，用 `createHttpReporter` 传 `url` + 可选 `transform` 即可。内部按场景自动降级：

- **页面卸载 / `visibilitychange` hidden**：`sendBeacon` → `fetch(keepalive)` → `image`
- **普通上报**：`fetch(keepalive)` → `sendBeacon` → `image` → `xhr`
- payload > 60KB 自动跳过 `sendBeacon`；payload > 64KB 自动关闭 `fetch` 的 `keepalive`
- `image` 通道用 `GET` 拼 query 上报 gif，可跨域，URL > 2000 字符时跳过

```ts
import { createHttpReporter } from "@goozyshi/tracker-sdk";

const httpReporter = createHttpReporter({
  name: "http",
  url: "https://log.example.com/collect",
  endpoints: {
    image: "https://log.example.com/pixel.gif",
  },
  transform: (event, data) => ({ e: event, ...data, t: Date.now() }),
  batchTransform: (events) => ({ batch: events }),
  headers: { "X-App": "demo" },
  credentials: "include",
  timeout: 5000,
  transport: ["beacon", "fetch", "image", "xhr"],
});
```


| 字段               | 类型                                          | 说明                                              |
| ---------------- | ------------------------------------------- | ----------------------------------------------- |
| `name`           | `string`                                    | 唯一标识                                            |
| `url`            | `string`                                    | 默认上报地址，所有未在 `endpoints` 覆盖的通道都走这里               |
| `endpoints`      | `Partial<Record<TransportChannel, string>>` | 按通道覆盖 URL，典型场景：`image` 单独指向 GET 像素接口            |
| `transform`      | `(event, data) => any`                      | 单条 payload 构造，默认 `{ event, data }`              |
| `batchTransform` | `(events) => any`                           | 批量 payload 构造，默认 `{ events }`                   |
| `transport`      | `TransportChannel[]`                        | 启用的通道，默认全开                                      |
| `headers`        | `Record<string,string>`                     | 自定义请求头（仅 `fetch` / `xhr` 生效）                    |
| `credentials`    | `RequestCredentials`                        | 跨域凭据                                            |
| `timeout`        | `number`                                    | 超时 (ms)                                         |
| `method`         | `'POST' \| 'GET'`                           | HTTP 方法，默认 `POST`                               |

## 内置数据中台 Reporter

通过 `tracker.init({ middlewareReporter })` 启用，SDK 会自动注册固定名称的 reporter `middleware`，无需手动 `addReporter()`。

```ts
import { tracker, sendEvent } from "@goozyshi/tracker-sdk";

tracker
  .init({
    defaultReporters: ["middleware"],
    middlewareReporter: {
      biz: "maidocha",
      env: "test",
      publicInfo: () => ({
        platform: "web",
        timestamp: Date.now(),
      }),
      headers: { "X-App": "zax" },
      credentials: "include",
      timeout: 5000,
      transport: ["image", "fetch", "beacon", "xhr"],
    },
  })
  .setGlobalData(() => ({ userId: getUserId() }))
  .setReporterGlobalData("middleware", () => ({
    publicInfo: { appVersion: "1.0.0" },
    traceId: getTraceId(),
  }));

sendEvent(
  "page_view",
  { page: "home" },
  {
    reporterData: {
      middleware: {
        publicInfo: { pageId: "home" },
        abGroup: "A",
      },
    },
  }
);
```

上面的请求体会被固定组装成：

```ts
{
  biz: "maidocha",
  public_info: {
    platform: "web",
    timestamp: 1710000000000,
    appVersion: "1.0.0",
    pageId: "home",
  },
  events: [
    {
      event_name: "page_view",
      client_timestamp: 1710000000000,
      extra: {
        userId: "u1",
        traceId: "t1",
        abGroup: "A",
        page: "home",
      },
    },
  ],
}
```

规则：

- `middlewareReporter.publicInfo` -> `public_info`
- `setGlobalData()` -> `events[].extra`
- `setReporterGlobalData("middleware", { publicInfo })` -> `public_info`
- `setReporterGlobalData("middleware", 其他字段)` -> `events[].extra`
- `sendEvent(..., { reporterData: { middleware: { publicInfo } } })` -> `public_info`
- `sendEvent(..., { reporterData: { middleware: 其他字段 } })` -> 当前事件 `extra`

环境与配置：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `biz` | `string` | 业务标识，必填 |
| `env` | `'test' \| 'prod'` | 环境标识，URL 由 SDK 内部维护；当前版本仅内置 `test` 地址 |
| `publicInfo` | `DataProvider` | 注入到 `public_info` |
| `endpoints` | `Partial<Record<TransportChannel, string>>` | 按通道覆盖 URL |
| `headers` | `Record<string,string>` | 自定义请求头 |
| `credentials` | `RequestCredentials` | 跨域凭据 |
| `timeout` | `number` | 超时 (ms) |
| `transport` | `TransportChannel[]` | 启用的通道，默认 `['image', 'fetch', 'beacon', 'xhr']` |
| `method` | `'POST' \| 'GET'` | HTTP 方法，默认 `POST` |


## 自定义 Reporter

需要对接私有 SDK 或做特殊处理时，实现 `Reporter` 接口即可：

```ts
import type { Reporter } from "@goozyshi/tracker-sdk";

const saReporter: Reporter = {
  name: "sa",
  track(event, data, ctx) {
    sensors.track(event, {
      $time: data?.ts,
      ...ctx?.privateData,
      ...data,
    });
  },
  batchTrack(events) {
    sensors.batchSend(
      events.map(({ event, data, privateData }) => ({
        event,
        ...privateData,
        ...data,
      }))
    );
  },
};
```


| 字段           | 必填  | 说明                                                 |
| ------------ | --- | -------------------------------------------------- |
| `name`       | ✅   | 唯一标识                                               |
| `track`      | ✅   | 单条上报，第三参 `ctx?.sync=true` 表示页面卸载场景，应走 `sendBeacon`；`ctx?.privateData` 为当前 reporter 私有数据 |
| `batchTrack` | ❌   | 批量上报，第三参同上；每条 `events[i].privateData` 为当前 reporter 私有数据 |
| `init`       | ❌   | 初始化钩子                                              |
| `destroy`    | ❌   | 销毁钩子                                               |


## 最佳实践

### 集中管理埋点名（带类型提示）

```ts
// src/tracker/events.ts
declare module "@goozyshi/tracker-sdk" {
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
import "./tracker/events";
```

使用时自动提示，无需 import：

```vue
<template>
  <!-- name 字段会有 'page_view' | 'banner_expose' | ... 提示 -->
  <div v-expose="{ name: 'banner_expose', data: { id: 1 } }">Banner</div>
</template>
```

```ts
sendEvent("page_view", { page: "home" });
```

### 统一参数类型

```ts
// src/tracker/params.ts
import type { Events } from "./events";

export interface EventParams {
  [Events.PAGE_VIEW]: { page: string };
  [Events.BANNER_EXPOSE]: { id: number; position?: string };
  [Events.PURCHASE]: { orderId: string; amount: number };
}
```

```ts
// 类型安全的 sendEvent
import { sendEvent } from "@goozyshi/tracker-sdk";
import { Events, type EventParams } from "@/tracker";

function trackEvent<K extends keyof EventParams>(
  event: K,
  data: EventParams[K]
) {
  sendEvent(event, data);
}

trackEvent(Events.PURCHASE, { orderId: "123", amount: 99 });
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

## 常见问题

### Vite 指令失效（v1.0.3 及以下）

1.0.3 及以下版本使用 `globalThis` 共享单例，Vite 预构建会导致模块隔离，指令失效。

**解决**：升级到 1.0.4+（已改用 `window`）。

## 类型导出

```ts
import type {
  Reporter,
  ReporterDataMap,
  ReporterPrivateData,
  ReporterContext,
  MiddlewareReporterEnv,
  MiddlewareReporterOptions,
  TrackerOptions,
  ExposureOptions,
  ClickOptions,
  SendEventOptions,
  TrackOptions,
  TrackEvent,
  Middleware,
  DataProvider,
  TransformFn,
  FilterFn,
  UnbindFn,
  HttpReporterOptions,
  TransportChannel,
  TransportRequest,
} from "@goozyshi/tracker-sdk";
```

