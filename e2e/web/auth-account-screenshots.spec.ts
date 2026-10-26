import { expect, type Page, type Route, test } from '@playwright/test';

// Screenshots of the sign-in, onboarding, account, driver documents and
// report-a-problem screens in light and dark at phone size, for the review of
// a redesign slice. Skipped unless E2E_SHOTS_DIR names where to write them:
//
//   E2E_SHOTS_DIR=docs/design/redesign-a/slices/141 pnpm e2e:web auth-account-screenshots
//
// It needs both web apps (E2E_CUSTOMER_URL, default http://localhost:8081, and
// E2E_DRIVER_URL, default http://localhost:8082) and a Firebase Auth emulator
// (the apps' EXPO_PUBLIC_WEB_AUTH_EMULATOR_URL). The API is answered in the
// browser (see `mockApi`), so no API, database or Mapbox token is needed, and
// every state of /me and of the driver's documents can be shown on demand.
import { stubMap } from './mapStub';
import { VIEWPORT } from './viewport';

const CUSTOMER_URL = (process.env.E2E_CUSTOMER_URL ?? 'http://localhost:8081').replace(/\/$/, '');
const DRIVER_URL = (process.env.E2E_DRIVER_URL ?? 'http://localhost:8082').replace(/\/$/, '');
const API_ORIGIN = new URL(process.env.E2E_SHOTS_API_URL ?? 'http://localhost:3000').origin;
const SHOTS_DIR = process.env.E2E_SHOTS_DIR;

const PASSWORD = 'Passw0rd!e2e';
const run = Date.now().toString(36);
const USER_ID = '0b5c1d2e-3f4a-4b6c-8d7e-9f0a1b2c3d4e';
const TRIP_ID = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';
const REPORT_ID = '11111111-2222-4333-8444-555555555555';

test.skip(!SHOTS_DIR, 'set E2E_SHOTS_DIR to take the screenshots');
test.use({ viewport: VIEWPORT });

const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const field = (page: Page, label: string) => page.locator(`[aria-label="${label}"]:visible`);

type VerificationState = 'unsubmitted' | 'pending' | 'rejected' | 'approved' | 'error';

/** What the browser-side API answers; tests change it between screens. */
interface ApiState {
  /** `GET /me`: `error` answers 500 until it is set to `ok`. */
  me: 'ok' | 'error';
  customerProfile: unknown;
  driverProfile: unknown;
  verification: VerificationState;
  reports: unknown[];
}

const CUSTOMER_PROFILE = { fullName: 'Amine Trabelsi', phone: '+21622333444' };
const DRIVER_PROFILE = {
  fullName: 'Karim Ben Salah',
  phone: '+21655666777',
  truckType: 'flatbed',
  plateNumber: '123 TU 4567',
};
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
let documentCount = 0;
const page1 = (kind: string, n = 1) => ({
  id: `00000000-0000-4000-8000-${String(++documentCount).padStart(12, '0')}`,
  kind,
  page: n,
  contentType: n === 1 ? 'image/jpeg' : 'application/pdf',
  sizeBytes: 1_400_000,
  createdAt: at(1),
});

function verificationBody(state: Exclude<VerificationState, 'error'>) {
  const all = [
    page1('licence'),
    page1('licence', 2),
    page1('registration'),
    page1('insurance'),
    page1('national_id'),
  ];
  switch (state) {
    case 'unsubmitted':
      return {
        status: 'unsubmitted',
        documents: all.slice(0, 3),
        missingKinds: ['national_id'],
      };
    case 'pending':
      return { status: 'pending', submittedAt: at(0), documents: all, missingKinds: [] };
    case 'rejected':
      return {
        status: 'rejected',
        rejectionReason: 'The insurance certificate has expired.',
        reviewedAt: at(0),
        documents: all,
        missingKinds: [],
      };
    case 'approved':
      return { status: 'approved', reviewedAt: at(0), documents: all, missingKinds: [] };
  }
}

const completedTrip = () => ({
  id: TRIP_ID,
  status: 'completed',
  pickup: { latitude: 36.8065, longitude: 10.1815, address: 'Avenue Habib Bourguiba, Tunis' },
  dropoff: { latitude: 36.8782, longitude: 10.3247, address: 'Avenue de la Liberté, La Marsa' },
  vehicleType: 'car',
  problemType: 'breakdown',
  distanceM: 18_400,
  suggestedFare: 80,
  proposedFare: 85,
  agreedFare: 85,
  expiresAt: at(-1),
  createdAt: at(2),
  completedAt: at(1),
  driver: { fullName: 'Karim Ben Salah', truckType: 'flatbed' },
  payment: { status: 'driver_confirmed', amountTnd: 85, receiptNo: 'DPN-2026-000123' },
});

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

/**
 * Answers the API in the browser. Only what these screens read is covered;
 * anything else (the receipt, the live socket) gets a 404.
 */
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

    if (pathname === '/me' && method === 'GET') {
      if (state.me === 'error') return json(route, { message: 'down' }, 500);
      return json(route, {
        id: USER_ID,
        email: `e2e-shots-${run}@example.com`,
        customerProfile: state.customerProfile,
        driverProfile: state.driverProfile,
      });
    }
    if (pathname === '/me/customer-profile' && method === 'PUT') {
      state.customerProfile = request.postDataJSON();
      return json(route, state.customerProfile);
    }
    if (pathname === '/me/driver-profile' && method === 'PUT') {
      state.driverProfile = request.postDataJSON();
      return json(route, state.driverProfile);
    }
    if (pathname === '/driver/verification') {
      if (state.verification === 'error') return json(route, { message: 'down' }, 500);
      return json(route, verificationBody(state.verification));
    }
    if (pathname === '/tow-requests/active') return route.fulfill({ status: 204, headers: CORS });
    if (pathname === '/tow-requests') {
      return json(route, { items: [completedTrip()], nextCursor: null });
    }
    if (pathname === `/tow-requests/${TRIP_ID}/reports`) {
      if (method === 'POST') {
        const input = request.postDataJSON() as { category: string; note: string };
        const created = {
          id: REPORT_ID,
          requestId: TRIP_ID,
          status: 'open',
          createdAt: at(0),
          ...input,
        };
        state.reports = [created, ...state.reports];
        return json(route, created, 201);
      }
      return json(route, state.reports);
    }
    return json(route, { message: 'not found' }, 404);
  });
}

/** Creates an account in the Auth emulator through the sign-up screen. */
async function signUp(page: Page, url: string, email: string) {
  await page.goto(url);
  await button(page, 'New here? Create an account').click();
  await expect(page.getByText('Create your account')).toBeVisible();
  await field(page, 'Email').fill(email);
  await field(page, 'Password').fill(PASSWORD);
  await field(page, 'Confirm password').fill(PASSWORD);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`customer app auth and account screens, ${scheme}`, async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: VIEWPORT,
    });
    const page = await context.newPage();
    await stubMap(page, scheme);
    const state: ApiState = {
      me: 'error',
      customerProfile: null,
      driverProfile: null,
      verification: 'unsubmitted',
      reports: [],
    };
    await mockApi(page, state);
    const shot = (name: string) =>
      page.screenshot({ path: `${SHOTS_DIR}/${scheme}-user-${name}.png` });
    const email = `e2e-shots-user-${scheme}-${run}@example.com`;

    try {
      await page.goto(CUSTOMER_URL);
      await expect(button(page, 'Sign in')).toBeVisible({ timeout: 90_000 });
      await shot('01-sign-in');

      await field(page, 'Email').fill('amine@example.com');
      await field(page, 'Password').fill('wrong-password');
      await button(page, 'Sign in').click();
      await expect(page.getByRole('alert')).toBeVisible();
      await shot('02-sign-in-error');

      await button(page, 'Forgot password?').click();
      await expect(button(page, 'Send reset link')).toBeVisible();
      await shot('03-forgot-password');
      await field(page, 'Email').fill(email);
      await button(page, 'Send reset link').click();
      await expect(page.getByText('Check your email')).toBeVisible();
      await shot('04-forgot-password-sent');
      await button(page, 'Back to sign in').click();

      await button(page, 'New here? Create an account').click();
      await expect(page.getByText('Create your account')).toBeVisible();
      await field(page, 'Email').fill(email);
      await field(page, 'Password').fill(PASSWORD);
      await field(page, 'Confirm password').fill(`${PASSWORD}x`);
      await shot('05-sign-up-mismatch');
      await field(page, 'Confirm password').fill(PASSWORD);
      await shot('06-sign-up');
      await button(page, 'Create account').click();

      // The account does not load at first: the spinner, then the retry.
      await expect(page.getByLabel('Loading your account')).toBeVisible();
      await shot('07-loading-account');
      await expect(page.getByText('Could not load your account from the server.')).toBeVisible({
        timeout: 30_000,
      });
      await shot('08-account-error');
      state.me = 'ok';
      await button(page, 'Try again').click();

      await expect(page.getByText('Tell us about you')).toBeVisible();
      await shot('09-onboarding');
      await field(page, 'Phone').fill('123');
      await button(page, 'Continue').click();
      await page.waitForTimeout(300);
      await shot('10-onboarding-errors');
      await field(page, 'Full name').fill(CUSTOMER_PROFILE.fullName);
      await field(page, 'Phone').fill(CUSTOMER_PROFILE.phone);
      await button(page, 'Continue').click();

      // The map home, then its Account link (a reload would lose the in-app route).
      await button(page, 'Account').click();
      await expect(button(page, 'Sign out')).toBeVisible({ timeout: 30_000 });
      await shot('11-account');
      await button(page, 'Edit details').click();
      await expect(button(page, 'Save')).toBeVisible();
      await shot('12-profile');
      await page.goBack();
      await button(page, 'Delete account').click();
      await field(page, 'Password').fill(PASSWORD);
      await shot('13-delete-account');

      state.reports = [];
      await page.goBack();
      await button(page, 'My requests').click();
      await page
        .getByText(/La Marsa/)
        .first()
        .click();
      await button(page, 'Report a problem with this trip').click();
      // The card sits at the end of the trip, below the fold.
      await button(page, 'Send report').scrollIntoViewIfNeeded();
      await shot('14-report-form');
      await page.getByRole('radio', { name: 'Overcharged' }).click();
      await field(page, 'What happened?').fill('The driver asked for more than the agreed fare.');
      await button(page, 'Send report').scrollIntoViewIfNeeded();
      await shot('15-report-filled');
      await button(page, 'Send report').click();
      await expect(page.getByText('Report sent')).toBeVisible();
      await shot('16-report-sent');
    } finally {
      await context.close();
    }
  });

  test(`driver app auth, account and documents screens, ${scheme}`, async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: VIEWPORT,
    });
    const page = await context.newPage();
    await stubMap(page, scheme);
    const state: ApiState = {
      me: 'ok',
      customerProfile: null,
      driverProfile: null,
      verification: 'unsubmitted',
      reports: [],
    };
    await mockApi(page, state);
    const shot = (name: string) =>
      page.screenshot({ path: `${SHOTS_DIR}/${scheme}-driver-${name}.png` });

    try {
      await page.goto(DRIVER_URL);
      await expect(button(page, 'Sign in')).toBeVisible({ timeout: 90_000 });
      await shot('01-sign-in');

      await signUp(page, DRIVER_URL, `e2e-shots-driver-${scheme}-${run}@example.com`);
      await button(page, 'Create account').click();

      await expect(page.getByText('Set up your driver profile')).toBeVisible();
      await shot('02-onboarding-details');
      await field(page, 'Full name').fill(DRIVER_PROFILE.fullName);
      await field(page, 'Phone').fill(DRIVER_PROFILE.phone);
      await button(page, 'Next').click();
      await expect(page.getByText('Step 2 of 2: your truck')).toBeVisible();
      await page.getByRole('radio', { name: 'Flatbed' }).click();
      await field(page, 'Plate number').fill(DRIVER_PROFILE.plateNumber);
      await shot('03-onboarding-truck');
      await button(page, 'Finish').click();

      // Finishing the profile of an unapproved driver lands on the documents.
      await expect(page.getByText("Driver's licence")).toBeVisible({ timeout: 30_000 });
      await shot('06-documents-start');
      await page.goBack();
      await button(page, 'Account').click();
      await expect(button(page, 'Sign out')).toBeVisible({ timeout: 30_000 });
      await shot('04-account');
      await button(page, 'Edit details').click();
      await expect(button(page, 'Save')).toBeVisible();
      await shot('05-profile');

      // The home card of a driver who is not approved opens the documents. A reload
      // empties the cache, so each state is read fresh.
      const openDocuments = async (verification: VerificationState) => {
        state.verification = verification;
        await page.goto(DRIVER_URL);
        const open = button(page, 'Open verification');
        await expect(open).toBeVisible({ timeout: 60_000 });
        await open.click();
      };

      await openDocuments('rejected');
      await expect(page.getByText(/The insurance certificate has expired/).last()).toBeVisible();
      await shot('07-documents-rejected');

      // A pending check is re-read every 15 seconds, so the decision shows up by itself.
      await openDocuments('pending');
      await expect(page.getByText(/Under review/)).toBeVisible();
      await shot('08-documents-pending');
      state.verification = 'approved';
      await expect(page.getByText(/Approved. You can go online/)).toBeVisible({ timeout: 40_000 });
      await shot('09-documents-approved');

      // No answer for the documents: open the screen by URL while the home still retries.
      state.verification = 'error';
      await page.goto(DRIVER_URL);
      await expect(page.getByText('Offline', { exact: true })).toBeVisible({ timeout: 60_000 });
      await page.evaluate(() => {
        window.history.pushState(null, '', '/verification');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await expect(page.getByText(/Loading your documents/)).toBeVisible();
      await shot('10-documents-loading');
      await expect(page.getByText(/Could not load your documents/)).toBeVisible({
        timeout: 30_000,
      });
      await shot('11-documents-error');
    } finally {
      await context.close();
    }
  });
}
