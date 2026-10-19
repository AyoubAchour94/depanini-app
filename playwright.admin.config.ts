import { defineConfig } from '@playwright/test';

// Browser end-to-end test of the admin web app (`pnpm e2e:admin`). It assumes a
// running stack (Postgres, Auth emulator, API, admin dev server); see README
// "Admin web app". URLs come from E2E_ADMIN_URL / E2E_API_URL / E2E_AUTH_EMULATOR.
export default defineConfig({
  testDir: 'e2e/admin',
  timeout: 2 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-admin' }]],
  outputDir: 'test-results-admin',
  use: {
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
