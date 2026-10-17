import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Creates and migrates the test database (needs Postgres: `pnpm db:up`).
    globalSetup: ['./test/support/global-setup.ts'],
  },
});
