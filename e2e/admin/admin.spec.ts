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
