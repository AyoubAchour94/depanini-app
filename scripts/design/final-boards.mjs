#!/usr/bin/env node
// The final visual-QA boards of the redesign: takes the screenshots of every
// screen of both apps in light and dark, and assembles one board per app x
// scheme.
//
//   node scripts/design/final-boards.mjs                  # 390x844, into docs/design/redesign-a/final
//   node scripts/design/final-boards.mjs --small          # 360x640, into .../final/small
//   node scripts/design/final-boards.mjs --with-map       # the apps have a real Mapbox token: keep the live map tiles
//   node scripts/design/final-boards.mjs --locale=fr      # the apps in French, into docs/design/i18n/fr (and .../small)
//   node scripts/design/final-boards.mjs --assemble-only  # only rebuild the boards from the shots on disk
//
// Needs the stack the screenshot specs need (see e2e/web/*-screenshots.spec.ts):
// both Expo web apps (E2E_CUSTOMER_URL, E2E_DRIVER_URL), the Auth emulator, and
// the API (E2E_SHOTS_API_URL) for the request flow. Everything else is answered
// in the browser. Without --with-map the map is a plain themed background (any
// `pk.` token in the apps' environment will do, nothing is fetched from Mapbox). Boards are drawn by Playwright itself (an HTML grid), so there is no
// image library to install.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const args = new Set(argv);
// --locale=fr: show the apps in that language (the specs translate their texts from the message files).
const locale = argv.find((arg) => arg.startsWith('--locale='))?.slice('--locale='.length);
const small = args.has('--small');
const withMap = args.has('--with-map');
const viewport = small ? '360x640' : '390x844';
const outDir = path.join(
  root,
  locale ? `docs/design/i18n/${locale}` : 'docs/design/redesign-a/final',
  small ? 'small' : '',
);
const rawDir = path.join(outDir, '.raw');

/** The screenshot specs, and which app each one shows (`by` picks a shared spec's shots by file name). */
const SPECS = [
  { spec: 'auth-account-screenshots', short: 'auth', app: 'customer', by: 'user-' },
  { spec: 'request-flow-screenshots', short: 'flow', app: 'customer' },
  { spec: 'customer-trip-screenshots', short: 'trip', app: 'customer' },
  { spec: 'auth-account-screenshots', short: 'auth', app: 'driver', by: 'driver-' },
  { spec: 'driver-home-screenshots', short: 'home', app: 'driver' },
  { spec: 'driver-job-screenshots', short: 'job', app: 'driver' },
];
const APPS = ['customer', 'driver'];
const SCHEMES = ['light', 'dark'];
const COLUMNS = small ? 8 : 7;
const SCALE = 0.5;

if (!args.has('--assemble-only')) {
  rmSync(rawDir, { recursive: true, force: true });
  for (const spec of new Set(SPECS.map((s) => s.spec))) {
    const dir = path.join(rawDir, spec);
    mkdirSync(dir, { recursive: true });
    console.log(`[boards] ${spec} at ${viewport}`);
    const run = spawnSync('pnpm', ['exec', 'playwright', 'test', spec], {
      cwd: root,
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        E2E_SHOTS_DIR: dir,
        E2E_SHOTS_VIEWPORT: viewport,
        E2E_SHOTS_MAP_STUB: withMap ? '' : '1',
        E2E_LOCALE: locale ?? 'en',
      },
    });
    if (run.status !== 0) {
      console.error(`[boards] ${spec} failed; the boards need every spec to pass`);
      process.exit(run.status ?? 1);
    }
  }
}

// Sort the raw shots into <app>/<scheme>-<name>.png.
const shots = { customer: { light: [], dark: [] }, driver: { light: [], dark: [] } };
if (args.has('--assemble-only')) {
  // The shots are already sorted: <app>/<scheme>-<spec>-<name>.png.
  for (const app of APPS) {
    for (const file of readdirSync(path.join(outDir, app)).sort()) {
      if (!file.endsWith('.png')) continue;
      const [scheme, short, ...name] = file.replace('.png', '').split('-');
      shots[app][scheme].push({
        file: path.join(outDir, app, file),
        label: `${short} ${name.join('-')}`,
      });
    }
  }
} else {
  for (const app of APPS) {
    rmSync(path.join(outDir, app), { recursive: true, force: true });
    mkdirSync(path.join(outDir, app), { recursive: true });
  }
  for (const { spec, short, app, by } of SPECS) {
    const dir = path.join(rawDir, spec);
    for (const file of readdirSync(dir).sort()) {
      const scheme = file.split('-')[0];
      const rest = file.slice(scheme.length + 1);
      if (!file.endsWith('.png') || (by && !rest.startsWith(by))) continue;
      const name = rest.slice(by?.length ?? 0);
      const target = path.join(outDir, app, `${scheme}-${short}-${name}`);
      copyFileSync(path.join(dir, file), target);
      shots[app][scheme].push({ file: target, label: `${short} ${name.replace('.png', '')}` });
    }
  }
  rmSync(rawDir, { recursive: true, force: true });
}

// One board per app x scheme: an HTML grid of the shots, rendered by Chromium.
const [width, height] = viewport.split('x').map(Number);
const cellWidth = Math.round(width * SCALE);
const browser = await chromium.launch();
try {
  for (const app of APPS) {
    for (const scheme of SCHEMES) {
      const items = shots[app][scheme];
      const dark = scheme === 'dark';
      const cells = items
        .map(
          ({ file, label }) =>
            `<figure><img src="${pathToFileURL(file).href}" width="${cellWidth}" />` +
            `<figcaption>${label}</figcaption></figure>`,
        )
        .join('');
      const html = `<!doctype html><meta charset="utf-8"><style>
        body { margin: 0; padding: 24px; background: ${dark ? '#0b0d10' : '#e9ebef'};
          font: 12px system-ui, sans-serif; color: ${dark ? '#c9ced6' : '#3a4150'}; }
        h1 { margin: 0 0 16px; font-size: 20px; }
        main { display: grid; grid-template-columns: repeat(${COLUMNS}, ${cellWidth}px); gap: 16px; }
        figure { margin: 0; } img { display: block; border-radius: 8px; }
        figcaption { margin-top: 4px; }
      </style><h1>Depanini ${app === 'driver' ? 'Driver' : ''} - ${scheme} - ${viewport}${locale ? ` - ${locale}` : ''} (${items.length} screens)</h1>
      <main>${cells}</main>`;
      const htmlFile = path.join(outDir, `.${app}-${scheme}.html`);
      writeFileSync(htmlFile, html);
      const page = await browser.newPage({
        viewport: { width: COLUMNS * (cellWidth + 16) + 32, height: 800 },
      });
      await page.goto(pathToFileURL(htmlFile).href);
      await page.waitForFunction(() =>
        [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      );
      const board = path.join(outDir, `${app}-${scheme}.png`);
      await page.screenshot({ path: board, fullPage: true });
      await page.close();
      rmSync(htmlFile);
      console.log(`[boards] ${path.relative(root, board)} (${items.length} screens)`);
    }
  }
} finally {
  await browser.close();
}
