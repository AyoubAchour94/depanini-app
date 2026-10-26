import { readFileSync } from 'node:fs';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  // The release tag of error reports (src/observability).
  define: { __APP_VERSION__: JSON.stringify(version) },
  // @depanini/shared is a CommonJS package (built to dist/); pre-bundle it for the browser.
  optimizeDeps: { include: ['@depanini/shared', 'firebase/app', 'firebase/auth'] },
  // `pnpm share admin` serves the dev server through a Cloudflare quick tunnel.
  server: { allowedHosts: ['.trycloudflare.com'] },
  build: { commonjsOptions: { include: [/shared[\\/]dist/, /node_modules/] } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Full-app renders are slow on a loaded runner; keep the per-test limit above asyncUtilTimeout.
    testTimeout: 20_000,
  },
});
