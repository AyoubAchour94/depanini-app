import { defineConfig } from '@playwright/test';

// Browser end-to-end test of the customer and driver web apps. It assumes a
// running stack (API, Auth emulator, both Expo web apps); see README "Browser
// end-to-end test". The app URLs come from E2E_CUSTOMER_URL / E2E_DRIVER_URL.
export default defineConfig({
  testDir: 'e2e/web',
  // One long scenario with two browsers; no retries, a flaky run is a finding.
  timeout: 5 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
