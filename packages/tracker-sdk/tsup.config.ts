import { defineConfig } from "tsup";

const entry = {
  index: "src/index.ts",
  react: "src/react.ts",
  vue: "src/vue.ts",
  vue2: "src/vue2.ts",
};

const shared = {
  entry,
  dts: true,
  minify: true,
  treeshake: true,
  splitting: false,
  external: [
    "@goozyshi/tracker-shared",
    "@goozyshi/tracker-core",
    "react",
    "vue",
  ],
};

export default defineConfig([
  {
    ...shared,
    format: ["esm"],
    outDir: "dist/es",
    clean: true,
    outExtension: () => ({ js: ".js" }),
  },
  {
    ...shared,
    format: ["cjs"],
    outDir: "dist/lib",
    clean: false,
    outExtension: () => ({ js: ".js" }),
  },
  {
    entry: { "tracker-sdk": "src/index.ts" },
    format: ["iife"],
    globalName: "TrackerSDK",
    outDir: "dist",
    minify: true,
    treeshake: true,
    dts: false,
    clean: false,
    outExtension: () => ({ js: ".min.js" }),
  },
]);
