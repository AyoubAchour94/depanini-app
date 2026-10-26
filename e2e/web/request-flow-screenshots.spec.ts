import { expect, type Page, test } from '@playwright/test';

// Screenshots of the customer request flow (home, pickup, drop-off, details,
// fare, open request) in light and dark at phone size, for the review of a
// redesign slice. Skipped unless E2E_SHOTS_DIR names where to write them:
//
//   E2E_SHOTS_DIR=docs/design/redesign-a/slices/137 pnpm e2e:web request-flow-screenshots
//
// It needs the customer web app (E2E_CUSTOMER_URL, default http://localhost:8081)
// with a running API and Auth emulator, and the Mapbox token in apps/mobile/.env.
// It leaves an open request per run behind, so use a fresh database before the
// tow-flow spec.
import { stubMap } from './mapStub';
import { VIEWPORT } from './viewport';

const CUSTOMER_URL = (process.env.E2E_CUSTOMER_URL ?? 'http://localhost:8081').replace(/\/$/, '');
const SHOTS_DIR = process.env.E2E_SHOTS_DIR;

const PASSWORD = 'Passw0rd!e2e';
const run = Date.now().toString(36);
const TUNIS = { latitude: 36.8065, longitude: 10.1815 };
/** A Mapbox-shaped answer, so the drop-off results do not depend on live search ranking. */
const SEARCH_RESULTS = [
  ['Garage El Amen', 'Avenue de la Liberté 12, 2078 La Marsa, Tunisie', 10.3247, 36.8782],
  ['La Marsa Corniche', 'Corniche, 2078 La Marsa, Tunisie', 10.3302, 36.8895],
  ['Marsa Plage', 'Route de la Marsa, 2078 La Marsa, Tunisie', 10.3341, 36.8801],
] as const;

test.skip(!SHOTS_DIR, 'set E2E_SHOTS_DIR to take the screenshots');
test.use({
  viewport: VIEWPORT,
  geolocation: TUNIS,
  permissions: ['geolocation'],
});

const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const field = (page: Page, label: string) => page.locator(`[aria-label="${label}"]:visible`);

/** The map tiles and the sheet have settled. */
async function settle(page: Page) {
  await page.waitForTimeout(3500);
}

async function stubSearch(page: Page) {
  await page.route(/\/search\/geocode\/v6\/forward/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        type: 'FeatureCollection',
        features: SEARCH_RESULTS.map(([name, address, lng, lat]) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { name, full_address: address, place_formatted: 'La Marsa, Tunisie' },
        })),
      }),
    }),
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test(`request flow screens, ${scheme}`, async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: VIEWPORT,
      geolocation: TUNIS,
      permissions: ['geolocation'],
    });
    const page = await context.newPage();
    await stubMap(page, scheme);
    await stubSearch(page);
    const shot = (name: string) => page.screenshot({ path: `${SHOTS_DIR}/${scheme}-${name}.png` });

    try {
      await page.goto(CUSTOMER_URL);
      await button(page, 'New here? Create an account').click();
      await expect(page.getByText('Create your account')).toBeVisible();
      await field(page, 'Email').fill(`e2e-shots-${scheme}-${run}@example.com`);
      await field(page, 'Password').fill(PASSWORD);
      await field(page, 'Confirm password').fill(PASSWORD);
      await button(page, 'Create account').click();
      await field(page, 'Full name').fill('Amine Trabelsi');
      await field(page, 'Phone').fill('+21622333444');
      await button(page, 'Continue').click();

      await expect(button(page, 'Request a tow')).toBeVisible({ timeout: 60_000 });
      await settle(page);
      await shot('1-home');

      await button(page, 'Request a tow').click();
      await expect(button(page, 'Confirm pickup')).toBeEnabled({ timeout: 30_000 });
      await settle(page);
      await shot('2-pickup');
      await button(page, 'Confirm pickup').click();

      await field(page, 'Where should it go?').fill('marsa');
      await expect(page.getByRole('button', { name: /Liberté/ })).toBeVisible();
      await shot('3-dropoff-search');

      await button(page, 'Pick on map').click();
      await expect(button(page, 'Confirm drop-off')).toBeEnabled({ timeout: 30_000 });
      await settle(page);
      await shot('4-dropoff-map');
      await button(page, 'Back').click();
      // The search starts empty again after the map.
      await field(page, 'Where should it go?').fill('marsa');
      await page.getByRole('button', { name: /Liberté/ }).click();
      await page.getByRole('radio', { name: 'Car', exact: true }).click();
      await page.getByRole('radio', { name: 'Breakdown' }).click();
      await field(page, 'Note for the driver (optional)').fill('Front left wheel is stuck');
      await shot('5-details');
      await button(page, 'Next').click();

      await expect(button(page, /^Send request · \d+ TND$/)).toBeVisible({ timeout: 30_000 });
      await settle(page);
      await shot('6-fare');
      // A short phone: the action must stay in view.
      await page.setViewportSize({ width: 360, height: 640 });
      await settle(page);
      await shot('6b-fare-small-phone');
      await page.setViewportSize(VIEWPORT);

      await button(page, /^Send request/).click();
      await expect(page.getByText('Waiting for drivers…')).toBeVisible();
      // Back on the map home, where the open request is the card in the sheet.
      await page.goto(CUSTOMER_URL);
      await expect(button(page, 'View your request')).toBeVisible();
      await settle(page);
      await shot('7-home-open-request');
    } finally {
      await context.close();
    }
  });
}
