import { expect, type Page, type Route, test } from '@playwright/test';

// Screenshots of the customer's open request with offers, the live trip, trip
// complete (payment and rating), history and the trip detail with its receipt,
// in light and dark at phone size, for the review of a redesign slice.
// Skipped unless E2E_SHOTS_DIR names where to write them:
//
//   E2E_SHOTS_DIR=docs/design/redesign-a/slices/138 pnpm e2e:web customer-trip-screenshots
//
// It needs the customer web app (E2E_CUSTOMER_URL, default http://localhost:8081)
// and a Firebase Auth emulator (the app's EXPO_PUBLIC_WEB_AUTH_EMULATOR_URL).
// The API is answered in the browser (see `mockApi`), so no API, database or
// driver is needed and every state of the trip can be shown on demand. Give the
// app's API URL (EXPO_PUBLIC_WEB_API_URL) as E2E_SHOTS_API_URL, default
// http://localhost:3000. The map shows live tiles only when the app has a
// Mapbox token; without one the map area is empty.
const CUSTOMER_URL = (process.env.E2E_CUSTOMER_URL ?? 'http://localhost:8081').replace(/\/$/, '');
const API_ORIGIN = new URL(process.env.E2E_SHOTS_API_URL ?? 'http://localhost:3000').origin;
const SHOTS_DIR = process.env.E2E_SHOTS_DIR;

const PASSWORD = 'Passw0rd!e2e';
const run = Date.now().toString(36);
const USER_ID = '0b5c1d2e-3f4a-4b6c-8d7e-9f0a1b2c3d4e';
const TRIP_ID = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';
const PAST_TRIP_ID = '3c1d9a7e-2b4f-4e8a-9d5c-6f7a8b9c0d1e';
const CANCELLED_TRIP_ID = '5d2e8b6f-1a3c-4f7b-8e9d-0a1b2c3d4e5f';

test.skip(!SHOTS_DIR, 'set E2E_SHOTS_DIR to take the screenshots');
test.use({ viewport: { width: 390, height: 844 } });

const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const field = (page: Page, label: string) => page.locator(`[aria-label="${label}"]:visible`);
/** Visible text, whole string: earlier screens stay mounted but hidden. */
const shown = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).locator('visible=true');

const CUSTOMER_PROFILE = { fullName: 'Amine Trabelsi', phone: '+21622333444' };
const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

const PICKUP = {
  latitude: 36.8065,
  longitude: 10.1815,
  address: 'Avenue Habib Bourguiba 42, 1001 Tunis, Tunisie',
};
const DROPOFF = {
  latitude: 36.8782,
  longitude: 10.3247,
  address: 'Avenue de la Liberté 12, 2078 La Marsa, Tunisie',
};
const DRIVER = {
  fullName: 'Sami Bouzid',
  phone: '+21655666777',
  truckType: 'flatbed',
  plateNumber: '123 TU 4567',
};

const baseRequest = {
  id: TRIP_ID,
  pickup: PICKUP,
  dropoff: DROPOFF,
  vehicleType: 'car',
  problemType: 'breakdown',
  note: 'Front left wheel is stuck',
  distanceM: 18_400,
  suggestedFare: 80,
  proposedFare: 85,
  createdAt: minutes(-2),
};

const openRequest = () => ({
  ...baseRequest,
  status: 'open',
  expiresAt: minutes(14),
});

const assignedRequest = (stage: string, extra: object = {}) => ({
  ...baseRequest,
  status: 'assigned',
  expiresAt: minutes(12),
  agreedFare: 85,
  assignedAt: minutes(-6),
  driver: DRIVER,
  tripStage: stage,
  ...extra,
});

const truckAt = { latitude: 36.8165, longitude: 10.1815, updatedAt: minutes(0) };

const completedRequest = (id = TRIP_ID, pickup = PICKUP, dropoff = DROPOFF) => ({
  ...baseRequest,
  id,
  pickup,
  dropoff,
  status: 'completed',
  expiresAt: minutes(-30),
  agreedFare: 85,
  assignedAt: minutes(-40),
  enRouteAt: minutes(-38),
  arrivedAt: minutes(-30),
  towingAt: minutes(-25),
  completedAt: minutes(-10),
  driver: { ...DRIVER, phone: null, plateNumber: null },
  payment: { status: 'driver_confirmed', amountTnd: 85, receiptNo: 'DPN-2026-000123' },
});

const offers = () => [
  {
    id: '11111111-1111-4111-8111-111111111111',
    requestId: TRIP_ID,
    fare: 80,
    etaMin: 11,
    distanceToPickupM: 5_200,
    status: 'pending',
    expiresAt: minutes(3),
    createdAt: minutes(-1),
    driver: {
      fullName: 'Nizar Hamdi',
      truckType: 'wheel_lift',
      rating: { average: null, count: 2 },
    },
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    requestId: TRIP_ID,
    fare: 85,
    etaMin: 6,
    distanceToPickupM: 1_800,
    status: 'pending',
    expiresAt: minutes(3),
    createdAt: minutes(-1),
    driver: { fullName: 'Sami Bouzid', truckType: 'flatbed', rating: { average: 4.8, count: 37 } },
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    requestId: TRIP_ID,
    fare: 95,
    etaMin: 4,
    distanceToPickupM: 1_100,
    status: 'pending',
    expiresAt: minutes(3),
    createdAt: minutes(-1),
    driver: {
      fullName: 'Karim Trabelsi',
      truckType: 'flatbed',
      rating: { average: 4.9, count: 112 },
    },
  },
];

/** What the browser-side API answers; the test changes it between screens. */
interface ApiState {
  active: unknown;
  offers: unknown[];
  history: unknown[];
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

/** Answers the API in the browser. Only what these screens read is covered; anything else gets a 404. */
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
        email: `e2e-shots-${run}@example.com`,
        customerProfile: CUSTOMER_PROFILE,
        driverProfile: null,
      });
    }
    if (pathname === '/tow-requests/active') {
      return state.active === null
        ? route.fulfill({ status: 204, headers: CORS })
        : json(route, state.active);
    }
    if (pathname === '/tow-requests')
      return json(route, { items: state.history, nextCursor: null });
    if (pathname === `/tow-requests/${TRIP_ID}/offers`) return json(route, state.offers);
    if (pathname.startsWith('/offers/') && pathname.endsWith('/accept')) {
      state.active = assignedRequest('accepted');
      return json(route, state.active);
    }
    if (pathname.endsWith('/rating')) {
      return json(route, {
        mine: null,
        otherSideRated: false,
        canRate: true,
        deadline: minutes(60 * 24 * 3),
      });
    }
    if (pathname.endsWith('/reports')) return json(route, []);
    if (pathname.endsWith('/receipt')) {
      return json(route, {
        receiptNo: 'DPN-2026-000123',
        completedAt: minutes(-10),
        pickup: PICKUP,
        dropoff: DROPOFF,
        distanceM: 18_400,
        vehicleType: 'car',
        problemType: 'breakdown',
        agreedFare: 85,
        method: 'cash',
        assignedAt: minutes(-40),
        enRouteAt: minutes(-38),
        arrivedAt: minutes(-30),
        towingAt: minutes(-25),
        driver: { fullName: 'Sami Bouzid', truckType: 'flatbed' },
        customer: { fullName: CUSTOMER_PROFILE.fullName },
      });
    }
    return json(route, { message: 'not found' }, 404);
  });
}

/** The map tiles and the sheet have settled. */
async function settle(page: Page) {
  await page.waitForTimeout(2500);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`customer offers, trip, completion and history screens, ${scheme}`, async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    // Every window.confirm in the app (accept offer) is answered with OK.
    page.on('dialog', (dialog) => void dialog.accept());
    const state: ApiState = { active: openRequest(), offers: [], history: [] };
    await mockApi(page, state);
    const shot = (name: string) => page.screenshot({ path: `${SHOTS_DIR}/${scheme}-${name}.png` });
    /** Scrolls every scrolled area back to its top (clicking a button low in the sheet scrolls it). */
    const toTop = () =>
      page.evaluate(() => {
        for (const div of document.querySelectorAll('div')) {
          if (div.scrollTop > 0 && div.clientHeight > 100) div.scrollTop = 0;
        }
      });
    /** Makes the open screen read the (changed) API state now, as when the app comes back to the front. */
    const refresh = async () => {
      await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await toTop();
      await settle(page);
    };
    /** Scrolls the sheet's or screen's content to its end. */
    const scrollDown = async () => {
      await page.mouse.move(195, 600);
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(500);
    };

    try {
      // Sign up in the Auth emulator; the browser-side API already has the profile.
      await page.goto(CUSTOMER_URL);
      await button(page, 'New here? Create an account').click();
      await expect(page.getByText('Create your account')).toBeVisible();
      await field(page, 'Email').fill(`e2e-shots-${scheme}-${run}@example.com`);
      await field(page, 'Password').fill(PASSWORD);
      await field(page, 'Confirm password').fill(PASSWORD);
      await button(page, 'Create account').click();
      await expect(button(page, 'View your request')).toBeVisible({ timeout: 60_000 });

      // 1. Open request, waiting; then with three offers.
      await button(page, 'View your request').click();
      await expect(shown(page, 'Waiting for drivers…')).toBeVisible();
      await settle(page);
      await shot('1a-waiting');
      state.offers = offers();
      await refresh();
      await expect(shown(page, '3 offers')).toBeVisible();
      await shot('1b-offers');

      // 2. Accept one: the live trip, stage by stage.
      await button(page, 'Accept').nth(1).click();
      await expect(shown(page, 'Your driver accepted')).toBeVisible();
      await toTop();
      await settle(page);
      await shot('2-trip-accepted');

      state.active = assignedRequest('en_route', {
        enRouteAt: minutes(-3),
        driverLocation: truckAt,
        etaMin: 6,
      });
      await refresh();
      await expect(shown(page, 'Your driver is on the way')).toBeVisible();
      await shot('3-trip-en-route');

      state.active = assignedRequest('arrived', {
        enRouteAt: minutes(-8),
        arrivedAt: minutes(-1),
        driverLocation: { ...truckAt, latitude: PICKUP.latitude },
      });
      await refresh();
      await expect(shown(page, 'Your driver has arrived')).toBeVisible();
      await shot('4-trip-arrived');

      state.active = assignedRequest('towing', {
        enRouteAt: minutes(-12),
        arrivedAt: minutes(-6),
        towingAt: minutes(-2),
        driverLocation: { ...truckAt, latitude: 36.84, longitude: 10.25 },
        etaMin: 9,
      });
      await refresh();
      await expect(shown(page, 'Towing your vehicle')).toBeVisible();
      await shot('5-trip-towing');

      // 3. Trip complete: payment question and rating.
      state.active = completedRequest();
      await refresh();
      await expect(shown(page, 'Trip complete')).toBeVisible();
      await shot('6a-complete');
      await scrollDown();
      await shot('6b-complete-rating');

      // 4. The request that expired without a driver.
      state.active = { ...openRequest(), status: 'expired', expiresAt: minutes(-1) };
      await refresh();
      await expect(shown(page, 'No driver took this request')).toBeVisible();
      await shot('7-request-expired');

      // 5. History and the trip detail with its receipt.
      state.active = null;
      state.history = [
        completedRequest(),
        {
          ...baseRequest,
          id: CANCELLED_TRIP_ID,
          status: 'cancelled',
          expiresAt: minutes(-60 * 24),
          createdAt: minutes(-60 * 24 - 20),
          pickup: { ...PICKUP, address: 'Rue de Marseille 8, 1001 Tunis, Tunisie' },
          dropoff: { ...DROPOFF, address: 'Marsa Plage, 2078 La Marsa, Tunisie' },
        },
        {
          ...completedRequest(
            PAST_TRIP_ID,
            { ...PICKUP, address: 'Avenue de Carthage 3, 1000 Tunis, Tunisie' },
            { ...DROPOFF, address: 'Lac 2, 1053 Les Berges du Lac, Tunisie' },
          ),
          createdAt: minutes(-60 * 24 * 9),
          completedAt: minutes(-60 * 24 * 9 + 40),
          proposedFare: 70,
          agreedFare: 70,
          payment: { status: 'customer_confirmed', amountTnd: 70, receiptNo: 'DPN-2026-000098' },
        },
      ];
      await refresh();
      await button(page, 'Back to the map').click();
      await button(page, 'Account').click();
      await button(page, 'My requests').click();
      await expect(shown(page, 'Avenue Habib Bourguiba 42, Tunis')).toBeVisible();
      await shot('8-history');

      await button(page, /Completed/)
        .first()
        .click();
      await expect(shown(page, 'Receipt no.')).toBeVisible();
      await settle(page);
      await shot('9a-trip-detail');
      await scrollDown();
      await shot('9b-trip-receipt');
    } finally {
      await context.close();
    }
  });
}
