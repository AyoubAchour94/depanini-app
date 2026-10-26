import type { Page } from '@playwright/test';

/**
 * Replaces the Mapbox map with a plain themed background, for screenshots
 * taken without a real Mapbox token (the app is started with any `pk.` token,
 * and nothing is fetched from Mapbox). Markers and the layout still show.
 * Active only when E2E_SHOTS_MAP_STUB=1, so a run with a real token keeps its tiles.
 */
export async function stubMap(page: Page, scheme: 'light' | 'dark') {
  if (process.env.E2E_SHOTS_MAP_STUB !== '1') return;
  const style = {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': scheme === 'dark' ? '#14171c' : '#e9ecef' },
      },
    ],
  };
  await page.route(/^https:\/\/(api|events)\.mapbox\.com\//, (route) =>
    route.request().url().includes('/styles/v1/')
      ? route.fulfill({
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(style),
        })
      : route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }),
  );
}
