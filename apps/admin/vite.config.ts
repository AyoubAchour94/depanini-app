import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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
  },
});
