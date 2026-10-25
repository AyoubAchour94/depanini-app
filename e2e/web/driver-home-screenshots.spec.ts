import { expect, type Page, type Route, test } from '@playwright/test';

// Screenshots of the driver home (gated, offline, online) and of a request
// with its counter-offer chips, in light and dark at phone size, for the
// review of a redesign slice. Skipped unless E2E_SHOTS_DIR names where to
// write them:
//
//   E2E_SHOTS_DIR=docs/design/redesign-a/slices/139 pnpm e2e:web driver-home-screenshots
//
// It needs the driver web app (E2E_DRIVER_URL, default http://localhost:8082)
// and a Firebase Auth emulator (the app's EXPO_PUBLIC_WEB_AUTH_EMULATOR_URL).
// The API is answered in the browser (see `mockApi`; E2E_SHOTS_API_URL is the
// app's API URL, default http://localhost:3000), so no API or database is
// needed. The map is empty without a Mapbox token in the app's environment.
const DRIVER_URL = (process.env.E2E_DRIVER_URL ?? 'http://localhost:8082').replace(/\/$/, '');
const API_ORIGIN = new URL(process.env.E2E_SHOTS_API_URL ?? 'http://localhost:3000').origin;
const SHOTS_DIR = process.env.E2E_SHOTS_DIR;

const PASSWORD = 'Passw0rd!e2e';
const run = Date.now().toString(36);
const USER_ID = '0b5c1d2e-3f4a-4b6c-8d7e-9f0a1b2c3d4e';
const TUNIS = { latitude: 36.8065, longitude: 10.1815 };

test.skip(!SHOTS_DIR, 'set E2E_SHOTS_DIR to take the screenshots');
test.use({ viewport: { width: 390, height: 844 } });

const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const field = (page: Page, label: string) => page.locator(`[aria-label="${label}"]:visible`);

/** What the browser-side API answers; the test changes it between screens. */
interface ApiState {
  verification: 'unsubmitted' | 'approved';
  online: boolean;
}

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const nearbyRequest = (
  n: number,
  pickup: string,
  dropoff: string,
  vehicleType: string,
  problemType: string,
  distanceToPickupM: number,
  proposedFare: number,
  rating: { average: number | null; count: number } | null,
) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  pickup: { latitude: 36.8 + n / 100, longitude: 10.18 + n / 100, address: pickup },
  dropoff: { latitude: 36.88, longitude: 10.32, address: dropoff },
  vehicleType,
  problemType,
  note: n === 1 ? 'Front left wheel is stuck' : null,
  distanceM: 12_000 + n * 2_400,
  proposedFare,
  suggestedFare: proposedFare,
  minFare: Math.round(proposedFare * 0.7),
  maxFare: Math.round(proposedFare * 2),
  expiresAt: minutesFromNow(14 - n),
  distanceToPickupM,
  myOffer: null,
  customer: rating ? { rating } : undefined,
});

const NEARBY = [
  nearbyRequest(
    1,
    'Avenue Habib Bourguiba 42, 1001 Tunis, Tunisie',
    'Garage El Amen, Avenue de la Liberté 12, 2078 La Marsa, Tunisie',
    'car',
    'breakdown',
    2_100,
    85,
    { average: 4.8, count: 31 },
  ),
  nearbyRequest(
    2,
    'Rue du Lac Biwa, 1053 Les Berges du Lac, Tunisie',
    'Avenue de la République 8, 2080 Ariana, Tunisie',
    'car',
    'accident',
    3_400,
    60,
    { average: null, count: 1 },
  ),
  nearbyRequest(
    3,
    'Rue El Menzah 6, 1004 El Menzah, Tunisie',
    'Route de Bizerte, 2050 Ben Arous, Tunisie',
    'suv_van',
    'flat_tire',
    5_000,
    120,
    { average: 4.2, count: 9 },
  ),
];

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

/** Answers the API in the browser. Only what the driver home reads is covered. */
async function mockApi(page: Page, state: ApiState) {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(body),
    });

  await page.route(new RegExp(`^${API_ORIGIN.replace(/[.]/g, '\\.')}/`), async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    if (pathname === '/me') {
      return json(route, {
        id: USER_ID,
        email: `e2e-shots-driver-${run}@example.com`,
        customerProfile: null,
        driverProfile: {
          fullName: 'Karim Ben Salah',
          phone: '+21655666777',
          truckType: 'flatbed',
          plateNumber: '123 TU 4567',
        },
      });
    }
    if (pathname === '/driver/verification') {
      return json(route, {
        status: state.verification,
        documents: [],
        missingKinds: state.verification === 'approved' ? [] : ['licence'],
      });
    }
    if (pathname === '/driver/presence' && method === 'PUT') {
      state.online = (request.postDataJSON() as { online: boolean }).online;
      return json(route, { online: state.online });
    }
    if (pathname === '/driver/requests/nearby') return json(route, NEARBY);
    if (pathname === '/driver/offers/active') return json(route, []);
    if (pathname === '/driver/job') return route.fulfill({ status: 204, headers: CORS });
    return json(route, { message: 'not found' }, 404);
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`driver home and request screens, ${scheme}`, async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 390, height: 844 },
      geolocation: TUNIS,
      permissions: ['geolocation'],
    });
    const page = await context.newPage();
    const state: ApiState = { verification: 'unsubmitted', online: false };
    await mockApi(page, state);
    const shot = (name: string) => page.screenshot({ path: `${SHOTS_DIR}/${scheme}-${name}.png` });

    try {
      await page.goto(DRIVER_URL);
      await expect(button(page, 'New here? Create an account')).toBeVisible({ timeout: 90_000 });
      await button(page, 'New here? Create an account').click();
      await expect(page.getByText('Create your account')).toBeVisible();
      await field(page, 'Email').fill(`e2e-shots-driver-${scheme}-${run}@example.com`);
      await field(page, 'Password').fill(PASSWORD);
      await field(page, 'Confirm password').fill(PASSWORD);
      await button(page, 'Create account').click();

      // Not approved yet: the card and the disabled switch.
      await expect(page.getByText('Verify your account to go online')).toBeVisible({
        timeout: 60_000,
      });
      await page.waitForTimeout(2500);
      await shot('1-home-gated');

      // Approved, read fresh so the "approved" notice does not show.
      state.verification = 'approved';
      await page.reload();
      await expect(page.getByText("You're offline")).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(2500);
      await shot('2-home-offline');

      await page.getByRole('switch').click();
      await expect(page.getByText('3 requests nearby')).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(3000);
      await shot('3-home-online');

      await button(page, /^View request: Avenue Habib Bourguiba/).click();
      await expect(button(page, /^Accept \d+ TND$/)).toBeVisible();
      await page.waitForTimeout(3000);
      await shot('4-request');

      await page.getByRole('radio', { name: 'Counter-offer 95 TND' }).click();
      await expect(button(page, 'Offer 95')).toBeVisible();
      await shot('5-request-counter-offer');
    } finally {
      await context.close();
    }
  });
}
