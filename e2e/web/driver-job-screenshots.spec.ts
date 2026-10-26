import { expect, type Page, test } from '@playwright/test';

// Screenshots of the driver's job screens (the job at each stage, the summary
// after the drop-off, earnings, job history) in light and dark at phone size,
// for the review of a redesign slice. Skipped unless E2E_SHOTS_DIR names where
// to write them:
//
//   E2E_SHOTS_DIR=docs/design/redesign-a/slices/140 pnpm e2e:web driver-job-screenshots
//
// It needs the driver web app as a dev server (E2E_DRIVER_URL, default
// http://localhost:8082): it opens the dev-only `/dev/driver` route, which shows
// the screens with sample data, so no API or Auth emulator is needed. The map
// needs the Mapbox token in apps/mobile/.env; without it the map area shows the
// "Mapbox token missing" notice.
const DRIVER_URL = (process.env.E2E_DRIVER_URL ?? 'http://localhost:8082').replace(/\/$/, '');
const SHOTS_DIR = process.env.E2E_SHOTS_DIR;

test.skip(!SHOTS_DIR, 'set E2E_SHOTS_DIR to take the screenshots');
test.use({ viewport: { width: 390, height: 844 } });

const SCREENS = [
  ['1-job-accepted', 'screen=job&stage=accepted', 'Start driving'],
  ['2-job-en-route', 'screen=job&stage=en_route', "I've arrived"],
  ['3-job-arrived', 'screen=job&stage=arrived', 'Vehicle loaded'],
  ['4-job-towing', 'screen=job&stage=towing', /^Dropped off/],
  ['5-job-done', 'screen=summary', 'Back to requests'],
  ['6-earnings', 'screen=earnings', null],
  ['7-history', 'screen=history', null],
] as const;

/** The map tiles and the sheet have settled. */
async function settle(page: Page) {
  await page.waitForTimeout(3500);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`driver job screens, ${scheme}`, async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    try {
      for (const [name, query, action] of SCREENS) {
        await page.goto(`${DRIVER_URL}/dev/driver?${query}&theme=${scheme}`);
        if (action) {
          // The next action stays in view, pinned at the bottom of the sheet.
          const next = page.getByRole('button', {
            name: action,
            exact: typeof action === 'string',
          });
          await expect(next).toBeVisible({ timeout: 120_000 });
          const box = (await next.boundingBox())!;
          expect(box.y + box.height).toBeLessThanOrEqual(844);
        } else {
          await expect(page.getByText('TND').first()).toBeVisible({ timeout: 120_000 });
        }
        await settle(page);
        await page.screenshot({ path: `${SHOTS_DIR}/${scheme}-${name}.png` });
      }
    } finally {
      await context.close();
    }
  });
}
