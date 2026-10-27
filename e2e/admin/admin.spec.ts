import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { expect, type Page, test } from '@playwright/test';

// The stack under test. Defaults match `apps/admin/.env.example` and the README.
const ADMIN_URL = (process.env.E2E_ADMIN_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMULATOR_URL = (process.env.E2E_AUTH_EMULATOR ?? 'http://127.0.0.1:9099').replace(/\/$/, '');

const PASSWORD = 'Passw0rd!e2e';
const run = Date.now().toString(36);
const driverName = `E2E Driver ${run}`;

/** A valid 1x1 PNG and a minimal PDF: the API checks the bytes, not just the type. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  'ascii',
);

interface Account {
  email: string;
  idToken: string;
}

async function signUp(label: string): Promise<Account> {
  const email = `e2e-admin-${label}-${run}@example.test`;
  const res = await fetch(
    `${EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    },
  );
  expect(res.status, await res.clone().text()).toBe(200);
  const { idToken } = (await res.json()) as { idToken: string };
  return { email, idToken };
}

async function api(
  account: Account,
  method: string,
  route: string,
  { body, expected = 200 }: { body?: unknown; expected?: number } = {},
) {
  const res = await fetch(`${API_URL}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${account.idToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  expect(res.status, `${method} ${route}: ${text}`).toBe(expected);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function upload(driver: Account, kind: string, bytes: Buffer, contentType: string) {
  const form = new FormData();
  form.set('kind', kind);
  form.set('file', new Blob([new Uint8Array(bytes)], { type: contentType }), 'scan');
  const res = await fetch(`${API_URL}/driver/documents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${driver.idToken}` },
    body: form,
  });
  expect(res.status, await res.text()).toBe(201);
}

/** A fresh ID token, which carries the claims granted since sign-up. */
async function refreshToken(account: Account) {
  const res = await fetch(
    `${EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: PASSWORD, returnSecureToken: true }),
    },
  );
  expect(res.status, await res.clone().text()).toBe(200);
  account.idToken = ((await res.json()) as { idToken: string }).idToken;
}

/** Sets the `admin` claim through the script, which only ever talks to the emulator. */
function grantAdmin(email: string) {
  execFileSync(
    process.execPath,
    [path.resolve(__dirname, '../../scripts/admin-grant.mjs'), email],
    {
      env: { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: new URL(EMULATOR_URL).host },
      stdio: 'pipe',
    },
  );
}

/** These tests read English; the app itself defaults to French (the last test). */
async function pinEnglish(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem('depanini.admin.language', 'en'));
}

async function signInOnPage(page: Page, account: Account) {
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('an admin approves a driver who has uploaded documents, and the driver can go online', async ({
  page,
}) => {
  const driver = await signUp('driver');
  const admin = await signUp('admin');
  const accounts = [driver, admin];

  try {
    // 1. A driver with a profile and all four documents, submitted for review.
    await api(driver, 'GET', '/me');
    await api(driver, 'PUT', '/me/driver-profile', {
      body: {
        fullName: driverName,
        phone: '+21620000002',
        truckType: 'flatbed',
        plateNumber: '123 TU 4567',
      },
    });
    await upload(driver, 'licence', PNG, 'image/png');
    await upload(driver, 'registration', PNG, 'image/png');
    await upload(driver, 'insurance', PDF, 'application/pdf');
    await upload(driver, 'national_id', PNG, 'image/png');
    await api(driver, 'POST', '/driver/verification/submit');

    // Not approved yet: going online is refused.
    await api(driver, 'PUT', '/driver/presence', {
      body: { online: true, location: { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' } },
      expected: 403,
    });

    // 2. An account without the admin claim is turned away.
    await pinEnglish(page);
    await page.goto(ADMIN_URL);
    await signInOnPage(page, driver);
    await expect(page.getByText('Not an admin')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

    // 3. The admin signs in and finds the driver in the review queue.
    await api(admin, 'GET', '/me');
    grantAdmin(admin.email);
    await signInOnPage(page, admin);
    await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
    await page.getByRole('link', { name: driverName }).click();

    // 4. The documents show inline: images as <img> that decoded, the PDF in an <iframe>.
    await expect(page.getByRole('heading', { name: driverName })).toBeVisible();
    const licence = page.getByRole('img', { name: "Driver's licence, page 1" });
    await expect(licence).toBeVisible();
    await expect
      .poll(() => licence.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.getByTitle('Insurance certificate, page 1')).toBeVisible();

    // 5. Approve, with confirmation.
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm approval' }).click();
    await expect(page.getByText('Approved', { exact: true })).toBeVisible();

    // 6. The driver can go online now, and the approval is in the audit log.
    await api(driver, 'PUT', '/driver/presence', {
      body: { online: true, location: { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' } },
    });
    await refreshToken(admin);
    const audit = await api(admin, 'GET', '/admin/audit?limit=5');
    expect(JSON.stringify(audit)).toContain('driver_approved');
  } finally {
    for (const account of accounts) {
      await fetch(`${API_URL}/me`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${account.idToken}` },
      }).catch(() => {});
      await fetch(
        `${EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:delete?key=fake-api-key`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idToken: account.idToken }),
        },
      ).catch(() => {});
    }
  }
});

/** Deletes the accounts from the API and the Auth emulator. */
async function cleanUp(accounts: Account[]) {
  for (const account of accounts) {
    await fetch(`${API_URL}/me`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${account.idToken}` },
    }).catch(() => {});
    await fetch(
      `${EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:delete?key=fake-api-key`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: account.idToken }),
      },
    ).catch(() => {});
  }
}

async function fetchJson(account: Account, route: string): Promise<unknown> {
  const res = await fetch(`${API_URL}${route}`, {
    headers: { authorization: `Bearer ${account.idToken}` },
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return res.json();
}

test('an admin resolves a customer report and a payment dispute on a completed trip', async ({
  page,
}) => {
  const customer = await signUp('customer');
  const driver = await signUp('driver2');
  const admin = await signUp('admin2');
  const customerName = `E2E Customer ${run}`;
  const reportNote = `Charged more than agreed ${run}`;
  const disputeNote = `I paid less in cash ${run}`;
  const reportResolution = `Refunded the difference ${run}`;
  const disputeResolution = `Driver confirmed the cash amount ${run}`;
  const pickup = {
    latitude: 36.8065,
    longitude: 10.1815,
    address: 'Avenue Habib Bourguiba, Tunis',
  };
  const dropoff = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };

  try {
    // 1. A trip, completed and paid in cash, seeded through the real API.
    await api(admin, 'GET', '/me');
    await api(customer, 'PUT', '/me/customer-profile', {
      body: { fullName: customerName, phone: '+21620000011' },
    });
    const driverAccount = await api(driver, 'GET', '/me');
    await api(driver, 'PUT', '/me/driver-profile', {
      body: {
        fullName: `E2E Driver ${run} B`,
        phone: '+21620000012',
        truckType: 'flatbed',
        plateNumber: '124 TU 4568',
      },
    });
    await upload(driver, 'licence', PNG, 'image/png');
    await upload(driver, 'registration', PNG, 'image/png');
    await upload(driver, 'insurance', PDF, 'application/pdf');
    await upload(driver, 'national_id', PNG, 'image/png');
    await api(driver, 'POST', '/driver/verification/submit');
    grantAdmin(admin.email);
    await refreshToken(admin);
    await api(admin, 'POST', `/admin/drivers/${driverAccount.id as string}/review`, {
      body: { decision: 'approve' },
    });
    await api(driver, 'PUT', '/driver/presence', { body: { online: true, location: pickup } });

    const estimate = await api(customer, 'POST', '/tow-requests/estimate', {
      body: { pickup, dropoff, vehicleType: 'car' },
    });
    const fare = estimate.suggestedFare as number;
    const request = await api(customer, 'POST', '/tow-requests', {
      expected: 201,
      body: {
        pickup,
        dropoff,
        vehicleType: 'car',
        problemType: 'breakdown',
        note: `e2e admin ${run}`,
        proposedFare: fare,
      },
    });
    const requestId = request.id as string;
    const offer = await api(driver, 'POST', `/tow-requests/${requestId}/offers`, {
      expected: 201,
      body: { fare },
    });
    await api(customer, 'POST', `/offers/${offer.id as string}/accept`);
    for (const stage of ['en_route', 'arrived', 'towing']) {
      await api(driver, 'POST', '/driver/job/stage', { body: { stage } });
    }
    await api(driver, 'POST', '/driver/job/complete', { body: { cashReceived: true } });
    await api(customer, 'POST', `/tow-requests/${requestId}/payment/dispute`, {
      body: { note: disputeNote },
    });
    await api(customer, 'POST', `/tow-requests/${requestId}/reports`, {
      expected: 201,
      body: { category: 'overcharged', note: reportNote },
    });

    // 2. The admin signs in; the report is in the reports queue.
    await pinEnglish(page);
    await page.goto(ADMIN_URL);
    await signInOnPage(page, admin);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(page.getByText(reportNote)).toBeVisible();

    // 3. Resolving needs a note.
    await page.getByRole('button', { name: 'Resolve' }).first().click();
    await page.getByRole('button', { name: 'Confirm resolution' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Write a note');
    await page
      .getByRole('dialog')
      .getByLabel(/Resolution note/)
      .fill(reportResolution);
    await page.getByRole('button', { name: 'Confirm resolution' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(reportNote)).toHaveCount(0);

    // 4. The resolved report shows who resolved it.
    await page.getByLabel('Status').selectOption('resolved');
    await expect(page.getByText(reportResolution)).toBeVisible();
    await expect(page.getByText(`Resolved by ${admin.email}`, { exact: false })).toBeVisible();

    // 5. The payment dispute is in its queue, and gets resolved the same way.
    await nav.getByRole('link', { name: 'Disputes' }).click();
    await expect(page.getByRole('heading', { name: 'Payment disputes' })).toBeVisible();
    await expect(page.getByText(disputeNote)).toBeVisible();
    await page.getByRole('button', { name: 'Resolve' }).first().click();
    await page
      .getByRole('dialog')
      .getByLabel(/Resolution note/)
      .fill(disputeResolution);
    await page.getByRole('button', { name: 'Confirm resolution' }).click();
    await expect(page.getByText(disputeNote)).toHaveCount(0);

    // 6. The trip shows the dispute resolution and the report.
    await page.goto(`${ADMIN_URL}/trips/${requestId}`);
    await expect(page.getByRole('region', { name: 'Payment' })).toContainText(disputeResolution);
    await expect(page.getByRole('region', { name: 'Reports' })).toContainText(reportNote);

    // 7. The customer sees their report resolved, through the API.
    const mine = (await fetchJson(customer, `/tow-requests/${requestId}/reports`)) as {
      status: string;
      resolutionNote: string;
    }[];
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: 'resolved', resolutionNote: reportResolution });

    // 8. Both actions are in the audit log.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Audit log' })
      .click();
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
    await expect(page.getByText('Resolved a report').first()).toBeVisible();
    await expect(page.getByText('Resolved a payment dispute').first()).toBeVisible();
    await expect(page.getByText(disputeResolution)).toBeVisible();
    await expect(page.getByText(reportResolution)).toBeVisible();

    // 9. Lookups: the trip is found by the customer's name, and the user by email.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Trips' })
      .click();
    await page.getByLabel('Trip id, receipt, customer or driver').fill(customerName);
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('link', { name: pickup.address })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Users' })
      .click();
    await page.getByLabel('Email or phone').fill(customer.email);
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('link', { name: customerName })).toBeVisible();
  } finally {
    await cleanUp([customer, driver, admin]);
  }
});

test('the app is in French by default, and the language switch is remembered', async ({ page }) => {
  await page.goto(ADMIN_URL);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();

  await page.getByLabel('Langue').selectOption('en');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
