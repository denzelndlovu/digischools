import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
    }),
  ],
  test: {
    globals: false,
    testTimeout: 60000,
    hookTimeout: 180000,
    fileParallelism: false,
    globalSetup: ['./src/test/global-setup.ts'],
  },
});
