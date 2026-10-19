#!/usr/bin/env node
// Shares the local stack on public URLs so a slice can be tried from a phone
// anywhere: `pnpm share [user|driver|both|admin]`.
//
// Opens Cloudflare quick tunnels (no account, random *.trycloudflare.com
// hostnames) to the web app, the API and the Auth emulator, then starts the
// API and Expo web with those URLs baked in. `both` shares the customer and
// driver apps at once (two Expo web processes, a tunnel each). Postgres must already be up
// (`pnpm db:up`); the Auth emulator is reused when it is already running.
// Ctrl+C stops everything this script started.
//
// `admin` shares the admin web app (Vite, port 5173) instead of Expo; it is not part of `both`.
//
// Anyone with the link can use the app, the API and the emulator until you
// stop it. Only emulator accounts exist there, so nothing real is exposed.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { corsOrigins, MODES, planApps, PORTS } from './share-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'user';
const children = [];
if (!MODES.includes(mode)) fail(`Unknown variant "${mode}" (${MODES.join(' | ')}).`);

// The Expo web apps to share: one per variant, each on its own port.
const apps = planApps(mode);

function fail(message) {
  console.error(`\n✖ ${message}`);
  stopAll();
  process.exit(1);
}

function log(message) {
  console.log(`[share] ${message}`);
}

function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitFor(port, label, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isListening(port)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail(`${label} did not start on port ${port}.`);
}

function cloudflaredPath() {
  const fromPath = spawnSync('cloudflared', ['--version'], { stdio: 'ignore' });
  if (fromPath.status === 0) return 'cloudflared';
  const winget = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
  if (existsSync(winget)) return winget;
  fail('cloudflared not found. Install it: winget install Cloudflare.cloudflared');
}

function start(label, command, args, options = {}) {
  const spawnOptions = {
    cwd: options.cwd ?? root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env },
  };
  // pnpm is a .cmd shim on Windows, so it needs a shell; Node wants the
  // command as one string then (the args here are fixed, nothing to escape).
  const child = options.shell
    ? spawn([command, ...args].join(' '), { ...spawnOptions, shell: true })
    : spawn(command, args, spawnOptions);
  children.push(child);
  child.on('exit', (code) => {
    if (!stopping) fail(`${label} exited (code ${code}).`);
  });
  if (options.echo) {
    child.stdout.on('data', (d) => process.stdout.write(prefix(label, d)));
    child.stderr.on('data', (d) => process.stderr.write(prefix(label, d)));
  }
  return child;
}

function prefix(label, data) {
  return data
    .toString()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => `[${label}] ${line}\n`)
    .join('');
}

/** Starts a quick tunnel to a local port and resolves with its public URL. */
function tunnel(label, port, binary) {
  return new Promise((resolve) => {
    const child = start(`tunnel:${label}`, binary, [
      'tunnel',
      '--no-autoupdate',
      '--url',
      `http://127.0.0.1:${port}`,
    ]);
    const timer = setTimeout(() => fail(`No tunnel URL for ${label} after 60s.`), 60_000);
    // cloudflared logs to stderr.
    child.stderr.on('data', (data) => {
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(data.toString());
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
  });
}

let stopping = false;
function stopAll() {
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    // Kill the whole tree: pnpm/expo spawn node processes that outlive their parent.
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
}
process.on('SIGINT', () => {
  log('stopping…');
  stopAll();
  process.exit(0);
});

// --- preflight -------------------------------------------------------------

if (!(await isListening(PORTS.db))) fail('Postgres is not running. Start it with `pnpm db:up`.');
for (const [label, port] of [
  ['API', PORTS.api],
  ...apps.map((app) => [app.variant === 'admin' ? 'Admin app' : `Expo ${app.variant}`, app.port]),
]) {
  if (await isListening(port)) {
    fail(`Port ${port} is busy (${label} already running?). Stop it first; share starts its own.`);
  }
}
const binary = cloudflaredPath();

// --- tunnels ---------------------------------------------------------------

log('opening tunnels…');
const [apiUrl, emulatorUrl, ...webUrls] = await Promise.all([
  tunnel('api', PORTS.api, binary),
  tunnel('emulator', PORTS.emulator, binary),
  ...apps.map((app) => tunnel(apps.length > 1 ? `web:${app.variant}` : 'web', app.port, binary)),
]);
const publicUrls = Object.fromEntries(apps.map((app, i) => [app.variant, webUrls[i]]));

// --- services --------------------------------------------------------------

if (await isListening(PORTS.emulator)) {
  log('reusing the running Auth emulator');
} else {
  log('starting the Auth emulator…');
  start('emulator', 'pnpm', ['emulators'], { shell: true });
  await waitFor(PORTS.emulator, 'Auth emulator');
}

log('starting the API…');
start('api', 'pnpm', ['--filter', '@depanini/api', 'start:dev'], {
  shell: true,
  echo: true,
  env: { CORS_ORIGINS: corsOrigins(apps, publicUrls).join(',') },
});

for (const app of apps) {
  if (app.variant === 'admin') {
    log(`starting the admin app (port ${app.port})…`);
    start(
      'admin',
      'pnpm',
      ['--filter', '@depanini/admin', 'exec', 'vite', '--port', String(app.port), '--strictPort'],
      {
        shell: true,
        env: {
          VITE_API_URL: apiUrl,
          VITE_AUTH_EMULATOR_URL: emulatorUrl,
          VITE_FIREBASE_PROJECT_ID: 'depanini-dev',
          VITE_FIREBASE_API_KEY: 'demo-api-key',
        },
      },
    );
    continue;
  }
  log(`starting Expo web (${app.variant}, port ${app.port})…`);
  start(
    `expo:${app.variant}`,
    'pnpm',
    ['exec', 'expo', 'start', '--web', '--clear', '--port', String(app.port)],
    {
      cwd: path.join(root, 'apps/mobile'),
      shell: true,
      env: {
        CI: '1',
        BROWSER: 'none',
        APP_VARIANT: app.variant,
        // Process env wins over apps/mobile/.env, so the bundle gets the public URLs.
        EXPO_PUBLIC_WEB_API_URL: apiUrl,
        EXPO_PUBLIC_WEB_AUTH_EMULATOR_URL: emulatorUrl,
      },
    },
  );
}
await Promise.all([
  waitFor(PORTS.api, 'API'),
  ...apps.map((app) =>
    waitFor(app.port, app.variant === 'admin' ? 'Admin app' : `Expo ${app.variant}`),
  ),
]);

// Build each bundle once so the first phone visit doesn't wait on Metro.
log('warming the web bundle…');
await Promise.all(
  apps.map(async ({ port, variant }) => {
    if (variant === 'admin') return;
    const html = await fetch(`http://localhost:${port}/`).then((r) => r.text());
    const bundle = /<script src="([^"]+)"/.exec(html)?.[1];
    if (bundle) await fetch(new URL(bundle, `http://localhost:${port}`)).then((r) => r.text());
  }),
);

const appLinks =
  mode === 'both'
    ? `    Customer  ${publicUrls.user}\n    Driver    ${publicUrls.driver}`
    : `    App       ${publicUrls[mode]}`;

console.log(`
  Depanini (${mode}) is shared:

${appLinks}
    API       ${apiUrl}
    Emulator  ${emulatorUrl}

  Open the ${mode === 'both' ? 'app links' : 'App link'} on ${mode === 'admin' ? 'any computer' : 'your phone'}. Ctrl+C stops everything.
`);
