import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // @depanini/shared is a CommonJS package (built to dist/); pre-bundle it for the browser.
  optimizeDeps: { include: ['@depanini/shared', 'firebase/app', 'firebase/auth'] },
  // `pnpm share admin` serves the dev server through a Cloudflare quick tunnel.
  server: { allowedHosts: ['.trycloudflare.com'] },
  // The hoisted install leaves two copies of @firebase/app (firebase and @firebase/auth each get
  // their own), which breaks sign-in ("Component auth has not been registered yet").
  resolve: {
    dedupe: ['@firebase/app', '@firebase/component', '@firebase/util', '@firebase/logger'],
  },
  build: { commonjsOptions: { include: [/shared[\\/]dist/, /node_modules/] } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
