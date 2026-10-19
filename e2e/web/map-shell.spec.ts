import { expect, type Page, test } from '@playwright/test';

// The map-first shell on the dev-only `/dev/map` route of the customer web app
// (a dev server, as `pnpm share` runs it: the route does not exist in a
// production export). It needs the Mapbox token in apps/mobile/.env, nothing else.
const CUSTOMER_URL = (process.env.E2E_CUSTOMER_URL ?? 'http://localhost:8081').replace(/\/$/, '');

test.use({ viewport: { width: 390, height: 844 } });

async function openShell(page: Page, query: string) {
  await page.goto(`${CUSTOMER_URL}/dev/map?${query}`);
  await expect(page.getByText('Request a tow')).toBeVisible({ timeout: 120_000 });
}

/** Height of the sheet panel, once it stopped animating. */
async function sheetHeight(page: Page): Promise<number> {
  const panel = page.getByTestId('map-sheet-panel');
  let last = -1;
  for (let i = 0; i < 30; i++) {
    const box = await panel.boundingBox();
    const height = Math.round(box?.height ?? 0);
    if (height === last) return height;
    last = height;
    await page.waitForTimeout(100);
  }
  return last;
}

/** A slow drag that ends at rest, so the sheet settles on the nearest snap point and does not fling. */
async function drag(page: Page, dy: number) {
  const grabber = (await page.getByTestId('map-sheet-grabber').boundingBox())!;
  const x = grabber.x + grabber.width / 2;
  const y = grabber.y + grabber.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x, y + (dy * i) / steps);
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(250);
  await page.mouse.move(x, y + dy + Math.sign(dy));
  await page.waitForTimeout(250);
  await page.mouse.up();
}

async function footerInView(page: Page) {
  const box = (await page.getByTestId('map-sheet-footer').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
}

test('the sheet drags between snap points and scrolls only at full', async ({ page }) => {
  await openShell(page, 'theme=light&snap=0');
  const content = page.getByTestId('map-sheet-content');
  const scrollTop = () => content.evaluate((el) => el.scrollTop);

  const peek = await sheetHeight(page);
  await footerInView(page);

  await drag(page, -300);
  await expect(page.getByText('light · half')).toBeVisible();
  const half = await sheetHeight(page);
  expect(half).toBeGreaterThan(peek + 100);
  await footerInView(page);

  // Not at full: the wheel must not scroll the content.
  await page.mouse.move(195, 600);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(200);
  expect(await scrollTop()).toBe(0);

  await drag(page, -400);
  await expect(page.getByText('light · full')).toBeVisible();
  expect(await sheetHeight(page)).toBeGreaterThan(half + 100);
  await footerInView(page);

  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, 300);
  await expect.poll(scrollTop).toBeGreaterThan(0);

  // Scrolled content is not dragged; back at the top, pulling down is.
  await content.evaluate((el) => (el.scrollTop = 0));
  await drag(page, 500);
  await expect(page.getByText('light · peek')).toBeVisible();
  expect(await sheetHeight(page)).toBeLessThan(half);
  await footerInView(page);
});

test('switching the theme restyles the same map without recreating it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openShell(page, 'theme=light&snap=1');
  await expect(page.locator('canvas.mapboxgl-canvas')).toHaveCount(1);
  await page.locator('canvas.mapboxgl-canvas').evaluate((el) => {
    (el as HTMLElement & { keep?: boolean }).keep = true;
  });

  await page.getByRole('button', { name: 'Appearance' }).click();
  await expect(page.getByText('dark · half')).toBeVisible();
  await page.waitForTimeout(3000);

  const canvas = page.locator('canvas.mapboxgl-canvas');
  await expect(canvas).toHaveCount(1);
  expect(await canvas.evaluate((el) => (el as HTMLElement & { keep?: boolean }).keep)).toBe(true);
  expect(errors).toEqual([]);
});
