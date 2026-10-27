import { expect, type Page, test } from '@playwright/test';

// A smoke test of the customer app in Arabic: a phone set to Arabic gets the
// app in Arabic, laid out right to left, in IBM Plex Sans Arabic, from the
// sign-in screen to the home map. It needs the customer web app, the API and
// the Auth emulator, like tow-flow.spec.ts.
const CUSTOMER_URL = (process.env.E2E_CUSTOMER_URL ?? 'http://localhost:8081').replace(/\/$/, '');
const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const AUTH_EMULATOR = (process.env.E2E_AUTH_EMULATOR ?? 'http://127.0.0.1:9099').replace(/\/$/, '');

const PASSWORD = 'Passw0rd!e2e';
const run = Date.now().toString(36);
const email = `e2e-arabic-${run}@example.com`;

// The phone's language: the app follows it under the default System setting.
test.use({
  locale: 'ar-TN',
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: 36.8065, longitude: 10.1815 },
  permissions: ['geolocation'],
});

async function emulator(endpoint: string, body: object) {
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=fake-api-key`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  );
  expect(res.status, `emulator ${endpoint}`).toBe(200);
  return (await res.json()) as { idToken: string };
}

async function api(token: string, method: string, path: string, body?: object) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  expect(res.status, `${method} ${path}`).toBeLessThan(300);
}

const field = (page: Page, label: string) => page.locator(`[aria-label="${label}"]:visible`);

/** The font the browser uses for a visible text. */
const fontOf = (page: Page, text: string) =>
  page
    .getByText(text, { exact: true })
    .locator('visible=true')
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily);

let token = '';

test.beforeAll(async () => {
  // A customer who has finished onboarding, so signing in lands on the home map.
  ({ idToken: token } = await emulator('signUp', {
    email,
    password: PASSWORD,
    returnSecureToken: true,
  }));
  await api(token, 'GET', '/me');
  await api(token, 'PUT', '/me/customer-profile', {
    fullName: `أمين ${run}`,
    phone: '+21622333444',
  });
});

test.afterAll(async () => {
  if (token) await api(token, 'DELETE', '/me');
});

test('signs in and shows the home map in Arabic, right to left', async ({ page }) => {
  await page.goto(CUSTOMER_URL);

  // Sign-in, in Arabic and right to left.
  await expect(page.getByText('مرحبًا بك في Depanini')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  expect(await fontOf(page, 'سجّل الدخول للمتابعة.')).toContain('IBMPlexSansArabic');

  // The email field's label sits at the right edge of the form, as Arabic reads.
  const emailField = field(page, 'البريد الإلكتروني');
  const label = page.getByText('البريد الإلكتروني', { exact: true }).locator('visible=true');
  const fieldBox = (await emailField.boundingBox())!;
  const labelBox = (await label.first().boundingBox())!;
  expect(fieldBox.x + fieldBox.width - (labelBox.x + labelBox.width)).toBeLessThan(24);

  await emailField.fill(email);
  await field(page, 'كلمة المرور').fill(PASSWORD);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();

  // Home: Arabic copy, and the menu button at the start of the top row, which is the right.
  await expect(page.getByText('أين سيارتك؟').locator('visible=true')).toBeVisible();
  await expect(page.getByRole('button', { name: 'اطلب شاحنة جرّ' })).toBeVisible();
  const menu = (await page.getByRole('button', { name: 'الحساب', exact: true }).boundingBox())!;
  expect(menu.x).toBeGreaterThan(390 / 2);
  expect(await fontOf(page, 'أين سيارتك؟')).toContain('IBMPlexSansArabic');
});
