# Tracker SDK

框架无关的埋点 SDK，monorepo 多包发布。支持命令式 API、Vue 指令、React Hook、Polaris 数据中台 reporter、自定义 reporter、IDM 身份管理、离线兜底、自动通道降级。

## 包结构

| 包                         | 职责                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `@goozyshi/tracker-shared` | 工具 / 类型 / uuid / storage / transport（4 通道降级）                                  |
| `@goozyshi/tracker-core`   | SDK 内核：配置 / IDM / Session / Pipeline / 队列 / Reporter Registry / 插件总线         |
| `@goozyshi/tracker-sdk`    | 集成包：内置 Polaris reporter、HTTP reporter 工厂、DOM 工具、React/Vue 子入口、CDN stub |

业务方只需安装 `@goozyshi/tracker-sdk`，依赖会自动带上 core/shared。

## 安装

```bash
pnpm add @goozyshi/tracker-sdk
# 或 npm i / yarn add
```

## 快速开始

### 创建实例

```ts
import { createTracker, createPolarisReporter } from "@goozyshi/tracker-sdk";

export const tracker = createTracker({
  appId: "mico-h5",
  reporters: {
    polaris: createPolarisReporter({
      biz: "mico_h5",
      env: "test",
      publicInfo: { platform: "web" },
    }),
  },
  defaultReporters: ["polaris"],
  idm: {
    userIdProvider: async () => ({ userId: await fetchUserId() }),
    providerTimeout: 3000,
  },
  superProperties: { app_version: "1.0.0" },
  onError: (err, scope, meta) => console.warn("[tracker]", scope, err, meta),
});

// autoInit 默认 true，无需手动调；想等 await 完成可 await tracker.init()
```

### 上报事件

```ts
tracker.track("page_view", { page: "home" });

tracker.track(
  "purchase",
  { order_id: "123", amount: 99 },
  {
    reporters: ["polaris"],
  }
);
```

`init()` 期间业务调用会进入 prequeue 缓冲，IDM 异步 provider 完成后按原始时间重放，identity 完整。

## CDN 接入

IIFE 产物挂全局 `TrackerSDK`。建议配合 `STUB_SNIPPET` 与 `installStub` 实现 SDK 加载前业务可调用。

```html
<!-- 1. 头部内联 stub（务必在 SDK script 之前） -->
<script>
  (function (w, k) {
    var q = [];
    function e(m) {
      return function () {
        q.push([m, arguments]);
      };
    }
    var s = { _q: q, onReady: e("onReady") };
    if (typeof Proxy === "function") {
      w[k] = new Proxy(s, {
        get: function (t, m) {
          if (m === "_q") return q;
          if (m === "onReady") return t.onReady;
          if (typeof m === "symbol" || m === "then") return undefined;
          return e(m);
        },
      });
    } else {
      w[k] = s;
    }
  })(window, "tracker");
</script>

<!-- 2. SDK 异步加载 -->
<script
  async
  src="https://unpkg.com/@goozyshi/tracker-sdk/dist/tracker-sdk.min.js"
  onload="(function(){
    var real = TrackerSDK.createTracker({
      appId: 'mico-h5',
      reporters: { polaris: TrackerSDK.createPolarisReporter({ biz: 'mico_h5' }) },
      defaultReporters: ['polaris'],
    });
    TrackerSDK.installStub(real);
  })()"
></script>

<!-- 3. 业务任意位置 -->
<script>
  window.tracker.track("page_view");
  window.tracker.identify("user-001");
  window.tracker.onReady(function () {
    window.tracker.track("app_ready");
  });
</script>
```

`STUB_SNIPPET` 同样从 `TrackerSDK.STUB_SNIPPET` 取得。`installStub` 会先把 `window.tracker` 替换为真实实例，再回放 `_q` 中的调用，单条失败相互隔离。

## 配置项 `TrackerConfig`

| 字段               | 类型                          | 说明                                                                 |
| ------------------ | ----------------------------- | -------------------------------------------------------------------- |
| `appId`            | `string`                      | 业务方应用标识，必填                                                 |
| `libVersion`       | `string`                      | SDK 版本字符串，默认 `'0.0.1'`                                       |
| `reporters`        | `Record<string, Reporter>`    | 命名 reporter 注册表                                                 |
| `reporter`         | `Reporter`                    | 单 reporter 简写，等价 `{ default: reporter }`                       |
| `defaultReporters` | `string[]`                    | `track` 未显式 reporters 时的默认通道，默认 `['default']`            |
| `idm`              | `IDMConfig`                   | 身份管理（userIdProvider、superPropertiesProvider、providerTimeout） |
| `session`          | `SessionConfig`               | 会话窗口（默认 30 分钟）                                             |
| `pipeline`         | `PipelineConfig`              | 采样率 / 脱敏黑名单 / trim 限制                                      |
| `queue`            | `QueueConfig`                 | 批量大小 / 间隔 / 离线持久化                                         |
| `retry`            | `RetryConfig`                 | 失败重试 `{ max=4, baseDelay=1000 }`                                 |
| `prequeue`         | `PrequeueConfig`              | init 期间缓冲 `{ maxSize=100 }`                                      |
| `superProperties`  | `JSONObject`                  | 全局静态属性                                                         |
| `onError`          | `(err, scope, meta?) => void` | 统一错误回调                                                         |

`tracker-sdk` 包的 `createTracker` 是 core 的薄封装，额外接受 `plugins?: Plugin[]` / `autoInit?: boolean`，默认自动 `init()`。

## Reporter

### 内置 Polaris Reporter

```ts
import { createPolarisReporter } from "@goozyshi/tracker-sdk";

const polaris = createPolarisReporter({
  biz: "mico_h5",
  env: "test",
  publicInfo: () => ({ platform: "web", tenant: getTenant() }),
  publicInfoFieldWhitelist: ["order_id"],
  headers: { "X-App": "mico" },
  credentials: "include",
  timeout: 5000,
  channels: ["fetch", "beacon", "image", "xhr"],
});
```

事件最终组装成北极星协议：

```ts
{
  biz: 'mico_h5',
  public_info: { platform, anonymous_id, user_id, session_id, app_id, lib_name, lib_version, url, ua, ... },
  events: [{ event_name, client_timestamp, event_id, extra: { ...properties, ...capability } }],
  extra: {},
  ab_info: {},
}
```

`publicInfoFieldWhitelist` 中的属性会从 `extra` 提升到 `public_info`。

### 通用 HTTP Reporter

```ts
import { createHttpReporter } from "@goozyshi/tracker-sdk";

const hybrid = createHttpReporter({
  name: "hybrid",
  url: "https://log.example.com/collect",
  buildBody: (envelopes, channel) => ({
    batch: envelopes.map((e) => ({ event: e.event, props: e.properties })),
    channel,
  }),
  channels: ["fetch", "beacon", "image", "xhr"],
  headers: { "X-App": "demo" },
  timeout: 5000,
});
```

通道降级（4 通道）：

- 普通上报：`fetch(keepalive)` → `beacon` → `image` → `xhr`
- 页面卸载（`sync: true`）：`beacon` → `fetch(keepalive)` → `image`
- payload > 60KB 跳过 beacon；> 64KB 关闭 fetch keepalive；image URL > 2KB 跳过

### 自定义 Reporter

实现 `Reporter` 接口即可，事件载体是 `EventEnvelope`：

```ts
import type { Reporter } from "@goozyshi/tracker-sdk";

const consoleReporter: Reporter = {
  name: "console",
  async send(envelopes) {
    for (const env of envelopes) console.log("[track]", env.event, env);
    return { ok: true };
  },
};
```

注册有两种方式：

```ts
// 方式 1：构造时注册
createTracker({
  reporters: { polaris, hybrid, console: consoleReporter },
  defaultReporters: ["polaris"],
});

// 方式 2：链式
tracker.addReporter("hybrid", hybrid).addReporter("console", consoleReporter);
```

## Vue 集成

### Vue 3

```ts
// main.ts
import { createTracker, createPolarisReporter } from "@goozyshi/tracker-sdk";
import { createVueBindings } from "@goozyshi/tracker-sdk/vue";

const tracker = createTracker({
  appId: "mico-h5",
  reporters: { polaris: createPolarisReporter({ biz: "mico_h5" }) },
  defaultReporters: ["polaris"],
});

const { exposeDirective, clickDirective } = createVueBindings(tracker);
app.directive("expose", exposeDirective);
app.directive("click", clickDirective);
```

```vue
<template>
  <div v-expose="{ name: 'banner_expose', data: { id: 1 } }">Banner</div>

  <div
    v-expose="{
      name: 'banner_expose',
      data: { id: bannerId },
      options: {
        threshold: 0.5,
        duration: 1000,
        once: true,
        reporters: ['hybrid'],
      },
    }"
  >
    Banner
  </div>

  <button
    v-click="{
      name: 'btn_click',
      data: { id: 'buy' },
      options: { debounce: 300 },
    }"
  >
    购买
  </button>
</template>
```

### Vue 2

```ts
import Vue from "vue";
import { createVue2Bindings } from "@goozyshi/tracker-sdk/vue2";

const { exposeDirective, clickDirective } = createVue2Bindings(tracker);
Vue.directive("expose", exposeDirective);
Vue.directive("click", clickDirective);
```

`v-expose` / `v-click` 配置：

| 字段                 | 类型              | 说明                     |
| -------------------- | ----------------- | ------------------------ |
| `name`               | `string`          | 事件名                   |
| `data`               | `JSONObject`      | 业务属性                 |
| `options.threshold`  | `number`          | 曝光可见比例，默认 `0.5` |
| `options.duration`   | `number`          | 曝光时长 ms，默认 `0`    |
| `options.once`       | `boolean`         | 仅上报一次，默认 `true`  |
| `options.groupKey`   | `string`          | 列表分组键               |
| `options.groupDelay` | `number`          | 分组延迟 ms，默认 `100`  |
| `options.debounce`   | `number`          | 点击防抖 ms              |
| `options.throttle`   | `number`          | 点击节流 ms              |
| `options.reporters`  | `string[] \| '*'` | 指定 reporter            |

## React 集成

```tsx
import { createTracker, createPolarisReporter } from "@goozyshi/tracker-sdk";
import { createReactBindings } from "@goozyshi/tracker-sdk/react";

const tracker = createTracker({
  appId: "mico-h5",
  reporters: { polaris: createPolarisReporter({ biz: "mico_h5" }) },
});
export const { useExposure, useClick, useBindClick, useTracker } =
  createReactBindings(tracker);
```

```tsx
function Banner() {
  const ref = useExposure<HTMLDivElement>(
    "banner_expose",
    { id: 1 },
    { threshold: 0.5, duration: 1000 }
  );
  return <div ref={ref}>Banner</div>;
}

function BuyBtn() {
  const onClick = useClick("btn_click", { id: "buy" }, { debounce: 300 });
  return <button onClick={onClick}>购买</button>;
}

function Card() {
  const ref = useBindClick<HTMLDivElement>("card_click", { id: "c1" });
  return <div ref={ref}>Card</div>;
}
```

`useClick` 返回 handler 自己挂；`useBindClick` 返回 ref，组件挂载即自动 `addEventListener`。

## 命令式 API

```ts
tracker.track(event, properties?, { reporters? });
tracker.identify(userId);          // 切登录态，会自动滚动 session
tracker.register({ key: value });  // 追加 superProperties
tracker.reset();                   // 登出，清空 userId + 滚动 anonymousId
tracker.onReady(() => {});         // 等待 init 完成
tracker.use(plugin);               // 注册插件
tracker.addReporter(name, reporter);
tracker.setReporterData(name, () => ({...})); // reporter 私有数据
tracker.destroy();
```

## IDM 身份管理

| 标识          | 来源                                   | 持久化                    |
| ------------- | -------------------------------------- | ------------------------- |
| `anonymousId` | 首次访问时生成 uuid                    | localStorage              |
| `userId`      | `identify(uid)` / `idm.userIdProvider` | localStorage              |
| `sessionId`   | 30 分钟空闲 / 跨日 / 切账号自动滚动    | localStorage + lastActive |

```ts
createTracker({
  idm: {
    userIdProvider: () =>
      fetch("/me")
        .then((r) => r.json())
        .then((u) => ({ userId: u.id })),
    superPropertiesProvider: async () => ({ tenant: await getTenant() }),
    providerTimeout: 3000,
  },
});
```

异步 provider 期间业务调 `track()`，事件进入 prequeue。provider 完成（成功/超时/失败）后 `markReady` 并重放，identity 完整。

`identify` 在 `userIdProvider` 完成前会被锁定（避免被 provider 覆盖），通过 `onError('identify_blocked', ...)` 暴露。

## Reporter 私有数据

不同 reporter 需要独立的全局数据时：

```ts
tracker
  .setReporterData("polaris", () => ({ publicInfo: { traceId: getTraceId() } }))
  .setReporterData("hybrid", () => ({ scene: getScene() }));
```

每个 envelope 会按 reporter 名称取一次值，注入到 `envelope.reporterScope`。Polaris reporter 中 `reporterScope.publicInfo` 会合并进 `public_info`，其余字段进 `events[].extra`。

## 插件

```ts
import type { Plugin } from "@goozyshi/tracker-sdk";

const samplePlugin: Plugin = {
  name: "sample",
  init(ctx) {
    ctx.tracker.register({ build: ctx.libVersion });
  },
  beforeProcess(raw) {
    if (raw.event.startsWith("debug_")) return null; // 丢弃
    return raw;
  },
  beforeSend(envelopes, ctx) {
    return envelopes;
  },
  afterSend(envelopes, result, ctx) {
    /* metric 上报等 */
  },
};

tracker.use(samplePlugin);
```

钩子：

- `init(ctx)` — 注册时调用
- `beforeProcess(raw)` — pipeline 前，可改写或返回 null 丢弃
- `beforeSend(envelopes, { reporterName })` — 入桶后、网络请求前，按 reporter 拦截
- `afterSend(envelopes, result, { reporterName })` — 上报后回调

## 事件模型 `EventEnvelope`

```ts
{
  schemaVersion: 'tracker.v1',
  eventId: 'uuid',
  event: 'banner_expose',
  type: 'track',
  time: 1730000000000,
  identity: { anonymousId, userId, sessionId },
  app: { appId, lib: { name, version } },
  system: { runtime, url, referrer, title, ua, viewportWidth, viewportHeight, screenWidth, screenHeight, timezoneOffset },
  capability?: { autotrack?: {...}, replay?: {...}, perf?: {...} },
  properties: { /* 业务属性 */ },
  reporterScope?: { /* setReporterData 注入 */ },
}
```

预置事件统一以 `$` 前缀（如 `$pageview`、`$session_start`）；业务事件不允许 `$` 开头。

## 通道降级与重试

- Reporter `send` 失败时 sender 用指数退避重试 `retry.max` 次（默认 4，base 1s）
- 4xx / payload 过大 / 通道全不支持 → 不重试，直接进 offline
- offline 用 localStorage 持久化，下次 `init()` 时 `bootstrapFromOffline` 取出重传
- 多 tab 之间靠 envelope `eventId` 服务端幂等去重，前端不加锁

## 错误回调 `onError(err, scope, meta?)`

| scope                                                           | 含义                                                |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `config_invalid`                                                | 配置非法                                            |
| `storage_unavailable` / `storage_full`                          | localStorage 不可用 / 配额满                        |
| `provider_failed`                                               | userIdProvider / superPropertiesProvider 失败或超时 |
| `identify_blocked`                                              | userIdProvider 锁定期间业务 identify                |
| `pipeline_error`                                                | 处理管道异常                                        |
| `plugin_error`                                                  | 插件钩子抛错                                        |
| `reporter_failed`                                               | reporter 重试耗尽                                   |
| `reporter_missing` / `route_invalid` / `no_reporter_registered` | reporter 路由问题                                   |
| `prequeue_overflow`                                             | init 期间缓冲超量                                   |
| `reporter_data_provider_failed`                                 | setReporterData provider 抛错                       |

## 类型导出

```ts
import type {
  // core
  Tracker,
  TrackerConfig,
  ResolvedConfig,
  TrackOptions,
  EventEnvelope,
  Reporter,
  ReporterRegistry,
  ReporterResult,
  ReporterSendOptions,
  Plugin,
  PluginContext,
  IDMConfig,
  SessionConfig,
  PipelineConfig,
  QueueConfig,
  RetryConfig,
  PrequeueConfig,
  TrackerErrorScope,
  TrackerErrorHandler,
  EventIdentity,
  EventApp,
  SystemContext,
  CapabilityRecord,
  // sdk
  PolarisReporterOptions,
  PolarisPayload,
  PolarisEventItem,
  PolarisPublicInfo,
  HttpReporterOptions,
  HttpReporterUrl,
  HttpReporterBody,
  ClickOptions,
  ExposureOptions,
  UnbindFn,
  InstallStubOptions,
  TrackerStub,
} from "@goozyshi/tracker-sdk";
```

## 最佳实践

### 集中管理事件名

```ts
// src/tracker/events.ts
export const Events = {
  PAGE_VIEW: "page_view",
  BANNER_EXPOSE: "banner_expose",
  PURCHASE: "purchase",
} as const;

export interface EventParams {
  [Events.PAGE_VIEW]: { page: string };
  [Events.BANNER_EXPOSE]: { id: number };
  [Events.PURCHASE]: { order_id: string; amount: number };
}

import { tracker } from "./tracker";
export function track<K extends keyof EventParams>(
  event: K,
  params: EventParams[K]
) {
  tracker.track(event, params);
}
```

### 项目结构

```
src/tracker/
├── index.ts        # createTracker + 业务初始化
├── events.ts       # 事件名 + 参数类型
├── reporters/      # 自定义 reporter（hybrid / console 等）
└── plugins/        # 自定义插件
```

## FAQ

**Q: SDK 加载到 ready 期间业务事件会丢吗？**
A: 不会。`init()` 期间事件进 prequeue（默认 100 条），ready 后按原始 time 重放。CDN 场景配合 stub snippet 可覆盖 SDK 还未加载阶段。

**Q: 离线数据刷新后会丢吗？**
A: 不会。bootstrap 时一次性回灌内存桶并触发 flush，成功后清通道，失败重新入 offline。多 tab 不加锁，靠服务端 eventId 幂等去重。

**Q: 怎么本地观察上报？**
A: 注册一个 `console` reporter，或在 `onError` / 插件 `afterSend` 钩子里打日志。
