import { defineConfig } from 'tsup';

const entry = {
  index: 'src/index.ts',
  vue: 'src/vue/index.ts',
  vue2: 'src/vue2/index.ts',
  react: 'src/react/index.ts',
};

const shared = {
  entry,
  dts: true,
  minify: true,
  treeshake: true,
  splitting: false,
  external: ['vue', 'react'],
};

export default defineConfig([
  {
    ...shared,
    format: ['esm'],
    outDir: 'dist/es',
    clean: true,
    outExtension: () => ({ js: '.js' }),
  },
  {
    ...shared,
    format: ['cjs'],
    outDir: 'dist/lib',
    clean: false,
    outExtension: () => ({ js: '.js' }),
  },
  {
    entry: { 'tracker-sdk': 'src/index.ts' },
    format: ['iife'],
    globalName: 'TrackerSDK',
    outDir: 'dist',
    minify: true,
    treeshake: true,
    dts: false,
    clean: false,
    outExtension: () => ({ js: '.min.js' }),
  },
]);
