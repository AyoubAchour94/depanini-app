import { execFileSync } from 'node:child_process';

import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';

// The apps under test. `pnpm share both` serves them on 8081 and 8082.
const CUSTOMER_URL = (process.env.E2E_CUSTOMER_URL ?? 'http://localhost:8081').replace(/\/$/, '');
const DRIVER_URL = (process.env.E2E_DRIVER_URL ?? 'http://localhost:8082').replace(/\/$/, '');

// The API and the Auth emulator, which the test uses to approve the driver as an admin.
const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const AUTH_EMULATOR = (process.env.E2E_AUTH_EMULATOR ?? 'http://127.0.0.1:9099').replace(/\/$/, '');
const FIXTURES = 'e2e/web/fixtures';

/** Tunis centre. The browser reports this position, so the pickup starts here. */
const TUNIS = { latitude: 36.8065, longitude: 10.1815 };

const PASSWORD = 'Passw0rd!e2e';
const run = Date.now().toString(36);
const DROPOFF_ADDRESS = `La Marsa ${run}, Tunis, Tunisie`;
/** How the screens show it: street and area, without the country (`shortAddress`). */
const DROPOFF_SHOWN = `La Marsa ${run}, Tunis`;
const customer = {
  email: `e2e-customer-${run}@example.com`,
  name: `E2E Customer ${run}`,
  phone: '+21622333444',
};
const driver = {
  email: `e2e-driver-${run}@example.com`,
  name: `E2E Driver ${run}`,
  phone: '+21655666777',
  plate: '123 TU 4567',
};

/**
 * Mapbox's search ranks "La Marsa" by closeness to the pickup but can still put
 * a namesake first (Al-Marsa, Medenine, 400 km away, so no driver is near it).
 * The drop-off search is therefore answered with a fixed La Marsa, Tunis; the
 * reverse geocoding of the pins and the map itself stay real.
 */
async function stubDropoffSearch(page: Page) {
  await page.route(/\/search\/geocode\/v6\/forward/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [10.3247, 36.8782] },
            properties: {
              name: 'La Marsa',
              full_address: DROPOFF_ADDRESS,
              place_formatted: 'Tunis, Tunisie',
            },
          },
        ],
      }),
    }),
  );
}

const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });

/**
 * A visible text input by its accessibility label (exact match). Expo Router
 * keeps earlier screens mounted but hidden, so the same label can exist twice.
 */
const field = (page: Page, label: string) => page.locator(`[aria-label="${label}"]:visible`);

/**
 * Visible text, whole-string for a string. Earlier screens stay mounted but
 * hidden (and the customer home repeats the stage in its open-request card).
 */
const shown = (page: Page, text: string | RegExp, options?: { exact?: boolean }) =>
  page.getByText(text, { exact: typeof text === 'string', ...options }).locator('visible=true');

async function newUser(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    geolocation: TUNIS,
    permissions: ['geolocation'],
    viewport: { width: 420, height: 1300 },
  });
  const page = await context.newPage();
  // Every window.confirm in the apps (accept offer, drop-off) is answered with OK.
  page.on('dialog', (dialog) => void dialog.accept());
  return { context, page };
}

async function signUp(page: Page, url: string, email: string) {
  await page.goto(url);
  await button(page, 'New here? Create an account').click();
  await expect(page.getByText('Create your account')).toBeVisible();
  await field(page, 'Email').fill(email);
  await field(page, 'Password').fill(PASSWORD);
  await field(page, 'Confirm password').fill(PASSWORD);
  await button(page, 'Create account').click();
}

type Review = { decision: 'approve' } | { decision: 'reject'; reason: string };

/** A throwaway admin in the Auth emulator, and a helper that reviews drivers as that admin. */
async function newAdmin() {
  const emulator = async (endpoint: string, body: object) => {
    const res = await fetch(
      `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=fake-api-key`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    expect(res.status, `emulator ${endpoint}`).toBe(200);
    return (await res.json()) as { idToken: string };
  };
  const email = `e2e-admin-${run}@example.com`;
  await emulator('signUp', { email, password: PASSWORD, returnSecureToken: true });
  // The grant script is an ES module the CommonJS test runner cannot import, so run it as a CLI.
  execFileSync('node', ['scripts/admin-grant.mjs', email], {
    env: { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: new URL(AUTH_EMULATOR).host },
    stdio: 'pipe',
  });
  // A fresh token carries the new claim.
  const { idToken } = await emulator('signInWithPassword', {
    email,
    password: PASSWORD,
    returnSecureToken: true,
  });
  const call = async (method: string, path: string, body?: object) => {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${idToken}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(res.status, `${method} ${path}`).toBeLessThan(300);
    return res.json();
  };
  return {
    /** Approves, or with a reason rejects, the pending driver with this name. */
    async review(fullName: string, decision: Review) {
      let cursor: string | null = null;
      do {
        const query: string = `status=pending&limit=50${cursor ? `&cursor=${cursor}` : ''}`;
        const page = (await call('GET', `/admin/drivers?${query}`)) as {
          items: { userId: string; fullName: string }[];
          nextCursor: string | null;
        };
        const found = page.items.find((item) => item.fullName === fullName);
        if (found) {
          await call('POST', `/admin/drivers/${found.userId}/review`, decision);
          return;
        }
        cursor = page.nextCursor;
      } while (cursor);
      throw new Error(`${fullName} is not in the pending review queue`);
    },
    async remove() {
      await emulator('delete', { idToken });
    },
  };
}

/**
 * Adds a page to a document on the driver's verification screen. The picker opens the
 * browser's file chooser; the test answers it with a fixture file.
 */
async function addDocumentPage(d: Page, action: string, kind: string, file: string) {
  const chooser = d.waitForEvent('filechooser');
  await button(d, `${action}: ${kind}`).click();
  await (await chooser).setFiles(`${FIXTURES}/${file}`);
}

async function deleteAccount(page: Page, url: string) {
  await page.goto(`${url}/`);
  await button(page, 'Account').click();
  await button(page, 'Delete account').click();
  await field(page, 'Password').fill(PASSWORD);
  await button(page, 'Delete my account').click();
  await expect(button(page, 'Sign in')).toBeVisible();
}

/** The value shown under the "Receipt no." label. */
async function receiptNo(page: Page): Promise<string> {
  const value = page
    .getByText('Receipt no.', { exact: true })
    .locator('xpath=following-sibling::*[1]');
  await expect(value).toHaveText(/\S+/);
  return (await value.innerText()).trim();
}

/** The customer picks the Tunis pin, a La Marsa drop-off and sends the request. */
async function requestTow(c: Page) {
  await button(c, 'Request a tow').click();
  // The browser position is inside Tunisia, so the pin starts there.
  const confirmPickup = button(c, 'Confirm pickup');
  await expect(confirmPickup).toBeEnabled();
  await confirmPickup.click();
  await field(c, 'Where should it go?').fill('La Marsa');
  await c.getByRole('button', { name: /Marsa/ }).first().click();
  await c.getByRole('radio', { name: 'Car', exact: true }).click();
  await c.getByRole('radio', { name: 'Breakdown' }).click();
  await button(c, 'Next').click();
  await expect(button(c, /^Send request · \d+ TND$/)).toBeVisible();
  await button(c, /^Send request/).click();
  await expect(shown(c, 'Waiting for drivers…')).toBeVisible();
}

test('customer requests a tow and a driver completes it', async ({ browser }, testInfo) => {
  const customerUser = await newUser(browser);
  const driverUser = await newUser(browser);
  const c = customerUser.page;
  const d = driverUser.page;
  await stubDropoffSearch(c);
  let admin: Awaited<ReturnType<typeof newAdmin>> | undefined;

  try {
    // 1. Both sign up and complete their profiles.
    await signUp(c, CUSTOMER_URL, customer.email);
    await field(c, 'Full name').fill(customer.name);
    await field(c, 'Phone').fill(customer.phone);
    await button(c, 'Continue').click();
    await expect(button(c, 'Request a tow')).toBeVisible();

    await signUp(d, DRIVER_URL, driver.email);
    await field(d, 'Full name').fill(driver.name);
    await field(d, 'Phone').fill(driver.phone);
    await button(d, 'Next').click();
    await d.getByRole('radio', { name: 'Flatbed' }).click();
    await field(d, 'Plate number').fill(driver.plate);
    await button(d, 'Finish').click();

    // 1b. Onboarding ends on the verification screen: the driver uploads the four documents
    // (a wrong file type is refused first), submits, is rejected once, fixes it and is approved
    // by an admin through the real admin API.
    await expect(shown(d, /^Upload each document/)).toBeVisible();
    await expect(button(d, 'Submit for review')).toBeDisabled();
    await addDocumentPage(d, 'Add PDF', "Driver's licence", 'not-a-document.txt');
    await expect(shown(d, /^That file type is not accepted/)).toBeVisible();
    await addDocumentPage(d, 'Choose photo', "Driver's licence", 'document.png');
    await addDocumentPage(d, 'Add PDF', 'Vehicle registration (carte grise)', 'document.pdf');
    await addDocumentPage(d, 'Choose photo', 'Insurance certificate', 'document.png');
    await expect(button(d, 'Submit for review')).toBeDisabled();
    await addDocumentPage(d, 'Add PDF', 'National ID (CIN)', 'document.pdf');
    await expect(shown(d, 'Uploaded (1 page)')).toHaveCount(4);
    await expect(button(d, 'Submit for review')).toBeEnabled();
    await button(d, 'Submit for review').click();
    await expect(shown(d, /^Under review/)).toBeVisible();
    await expect(button(d, 'Submit for review')).toHaveCount(0);

    // The screen checks for the decision every few seconds while it is pending.
    admin = await newAdmin();
    await admin.review(driver.name, { decision: 'reject', reason: 'The photos are blurry' });
    await expect(shown(d, 'Rejected: The photos are blurry')).toBeVisible({ timeout: 40_000 });
    await addDocumentPage(d, 'Add PDF', "Driver's licence", 'document.pdf');
    await expect(shown(d, 'Rejected (2 pages)')).toBeVisible();
    await button(d, 'Submit for review').click();
    await expect(shown(d, /^Under review/)).toBeVisible();
    await admin.review(driver.name, { decision: 'approve' });
    await expect(shown(d, 'Approved. You can go online.')).toBeVisible({ timeout: 40_000 });
    await d.goBack();

    // 2. The driver sets a test location in Tunis and goes online.
    await button(d, 'Set on map').click();
    // The map starts at Tunis centre; confirm it once its address is found.
    const useLocation = button(d, 'Use this location');
    await expect(useLocation).toBeEnabled();
    await useLocation.click();
    await expect(d.getByText(/^Using: .* \(test\)$/)).toBeVisible();
    await d.getByRole('switch', { name: 'Online' }).click();
    await expect(d.getByRole('switch', { name: 'Online' })).toBeChecked();

    // 3. The customer requests a tow near it.
    await requestTow(c);

    // 4. The driver sees it and sends an offer; the customer accepts.
    // A new request reaches the driver as a `nearby.changed` push over the socket.
    // The drop-off is unique to this run, so requests left by other runs are ignored.
    await button(d, /^View request/)
      .filter({ hasText: DROPOFF_SHOWN })
      .click({ timeout: 10_000 });
    const acceptFor = d.getByRole('button', { name: /^Accept \d+ TND$/ });
    const fare = Number(/\d+/.exec(await acceptFor.innerText())![0]);
    await acceptFor.click();
    await expect(shown(d, `Your offer: ${fare} TND`)).toBeVisible();

    await button(c, 'Accept').click();
    await expect(shown(c, 'Driver assigned')).toBeVisible();
    await expect(shown(c, 'Your driver accepted')).toBeVisible();

    // 5. The driver taps through the steps; the customer sees each stage live.
    await button(d, 'Start driving').click();
    await expect(shown(c, 'Your driver is on the way')).toBeVisible();
    await button(d, "I've arrived").click();
    await expect(shown(c, 'Your driver has arrived')).toBeVisible();
    await button(d, 'Vehicle loaded').click();
    await expect(shown(c, 'Towing your vehicle')).toBeVisible();
    await button(d, `Dropped off · cash ${fare} TND`).click();
    await expect(shown(d, 'Trip complete')).toBeVisible();
    const driverReceiptNo = await receiptNo(d);
    await expect(shown(c, 'Trip complete')).toBeVisible();

    // 6. The customer confirms the payment; both open the trip with its receipt.
    await expect(shown(c, new RegExp(`Did you pay ${fare} TND`))).toBeVisible();
    await button(c, 'Yes, I paid').click();
    await expect(shown(c, 'Payment confirmed')).toBeVisible();

    // Both sides rate the other. The driver tries 2 stars without a tag first.
    await expect(shown(c, 'Rate your driver')).toBeVisible();
    await button(c, '5 stars').click();
    await c.getByRole('checkbox', { name: 'On time' }).click();
    await button(c, 'Send rating').click();
    await expect(shown(c, 'Thanks for rating')).toBeVisible();

    await expect(shown(d, 'Rate your customer')).toBeVisible();
    await button(d, '2 stars').click();
    await button(d, 'Send rating').click();
    await expect(shown(d, 'Tell us what went wrong: pick at least one tag.')).toBeVisible();
    await d.getByRole('checkbox', { name: 'Made me wait' }).click();
    await button(d, 'Send rating').click();
    await expect(shown(d, 'Thanks for rating')).toBeVisible();
    await button(c, 'Done').click();
    await button(c, 'Account').click();
    await button(c, 'My requests').click();
    await button(c, /Completed/)
      .first()
      .click();
    expect(await receiptNo(c)).toBe(driverReceiptNo);
    await expect(shown(c, 'Receipt', { exact: true })).toBeVisible();
    await c.screenshot({ path: testInfo.outputPath('receipt-customer.png'), fullPage: true });

    // The customer reports a problem with the trip (not the payment dispute).
    await button(c, 'Report a problem with this trip').click();
    await c.getByRole('radio', { name: 'Overcharged' }).click();
    await field(c, 'What happened?').fill('Asked for more than the agreed fare');
    await button(c, 'Send report').click();
    await expect(shown(c, 'Report sent')).toBeVisible();
    await expect(shown(c, 'Open', { exact: true })).toBeVisible();

    await button(d, 'Back to requests').click();
    await button(d, 'My jobs').click();
    await button(d, /^View job/)
      .first()
      .click();
    expect(await receiptNo(d)).toBe(driverReceiptNo);
    await d.screenshot({ path: testInfo.outputPath('receipt-driver.png'), fullPage: true });

    // 7. The driver's earnings today show the fare, and My jobs lists the trip.
    await d.goto(`${DRIVER_URL}/`);
    await button(d, 'Earnings').click();
    const today = d.getByText('Today', { exact: true }).locator('xpath=..');
    await expect(today).toContainText(`${fare} TND`);
    await expect(today).toContainText('1 trip');

    // 8. A second request shows the ratings. Each side has one rating so far,
    // below the threshold of three, so both badges read "New".
    await c.goto(`${CUSTOMER_URL}/`);
    await requestTow(c);
    await d.goto(`${DRIVER_URL}/`);
    const online = d.getByRole('switch', { name: 'Online' });
    await expect(online).toBeVisible();
    if (!(await online.isChecked())) {
      await online.click();
      await expect(online).toBeChecked();
    }
    const row = button(d, /^View request/).filter({ hasText: DROPOFF_SHOWN });
    await expect(row).toContainText('New', { timeout: 10_000 });
    await row.click();
    const acceptAgain = d.getByRole('button', { name: /^Accept \d+ TND$/ });
    await expect(shown(d, 'New')).toBeVisible();
    await acceptAgain.click();
    const offerCard = c.locator('div:visible', { hasText: driver.name }).filter({
      has: button(c, 'Accept'),
    });
    await expect(offerCard.last()).toContainText('New');
    await c.screenshot({ path: testInfo.outputPath('offer-rating.png'), fullPage: true });
    await button(c, 'Cancel request').click();
    await expect(button(c, 'Request a tow')).toBeVisible();

    // 9. Clean up through the UI.
    await deleteAccount(c, CUSTOMER_URL);
    await deleteAccount(d, DRIVER_URL);
  } finally {
    await admin?.remove();
    await customerUser.context.close();
    await driverUser.context.close();
  }
});
