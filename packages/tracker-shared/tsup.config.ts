import { defineConfig } from 'tsup';

const shared = {
  entry: { index: 'src/index.ts' },
  dts: true,
  minify: true,
  treeshake: true,
  splitting: false,
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
]);
