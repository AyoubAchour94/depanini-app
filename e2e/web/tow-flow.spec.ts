import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';

// The apps under test. `pnpm share both` serves them on 8081 and 8082.
const CUSTOMER_URL = (process.env.E2E_CUSTOMER_URL ?? 'http://localhost:8081').replace(/\/$/, '');
const DRIVER_URL = (process.env.E2E_DRIVER_URL ?? 'http://localhost:8082').replace(/\/$/, '');

/** Tunis centre. The browser reports this position, so the pickup starts here. */
const TUNIS = { latitude: 36.8065, longitude: 10.1815 };

const PASSWORD = 'Passw0rd!e2e';
const run = Date.now().toString(36);
const DROPOFF_ADDRESS = `La Marsa ${run}, Tunis, Tunisie`;
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

test('customer requests a tow and a driver completes it', async ({ browser }, testInfo) => {
  const customerUser = await newUser(browser);
  const driverUser = await newUser(browser);
  const c = customerUser.page;
  const d = driverUser.page;
  await stubDropoffSearch(c);

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
    await expect(shown(c, /^Suggested: \d+ TND$/)).toBeVisible();
    await button(c, 'Send request').click();
    await expect(shown(c, 'Waiting for drivers…')).toBeVisible();

    // 4. The driver sees it and sends an offer; the customer accepts.
    // New requests are not pushed over the socket; with it live the list polls every 30 s.
    // The drop-off is unique to this run, so requests left by other runs are ignored.
    await button(d, /^View request/)
      .filter({ hasText: DROPOFF_ADDRESS })
      .click({ timeout: 45_000 });
    const acceptFor = d.getByRole('button', { name: /^Accept for \d+ TND$/ });
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
    await button(d, `Dropped off · cash received ${fare} TND`).click();
    await expect(shown(d, 'Trip complete')).toBeVisible();
    const driverReceiptNo = await receiptNo(d);
    await expect(shown(c, 'Trip complete')).toBeVisible();

    // 6. The customer confirms the payment; both open the trip with its receipt.
    await expect(shown(c, new RegExp(`Did you pay ${fare} TND`))).toBeVisible();
    await button(c, 'Yes, I paid').click();
    await expect(shown(c, 'Payment confirmed')).toBeVisible();
    await button(c, 'Done').click();
    await button(c, 'Account').click();
    await button(c, 'My requests').click();
    await button(c, /Completed/)
      .first()
      .click();
    expect(await receiptNo(c)).toBe(driverReceiptNo);
    await expect(shown(c, 'Receipt', { exact: true })).toBeVisible();
    await c.screenshot({ path: testInfo.outputPath('receipt-customer.png'), fullPage: true });

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

    // 8. Clean up through the UI.
    await deleteAccount(c, CUSTOMER_URL);
    await deleteAccount(d, DRIVER_URL);
  } finally {
    await customerUser.context.close();
    await driverUser.context.close();
  }
});
