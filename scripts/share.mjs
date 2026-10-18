#!/usr/bin/env node
// Shares the local stack on public URLs so a slice can be tried from a phone
// anywhere: `pnpm share [user|driver]`.
//
// Opens Cloudflare quick tunnels (no account, random *.trycloudflare.com
// hostnames) to the web app, the API and the Auth emulator, then starts the
// API and Expo web with those URLs baked in. Postgres must already be up
// (`pnpm db:up`); the Auth emulator is reused when it is already running.
// Ctrl+C stops everything this script started.
//
// Anyone with the link can use the app, the API and the emulator until you
// stop it. Only emulator accounts exist there, so nothing real is exposed.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const variant = process.argv[2] ?? 'user';
if (!['user', 'driver'].includes(variant)) fail(`Unknown variant "${variant}" (user | driver).`);

const PORTS = { web: 8081, api: 3000, emulator: 9099, db: 5432 };
const children = [];

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
  ['Expo', PORTS.web],
]) {
  if (await isListening(port)) {
    fail(`Port ${port} is busy (${label} already running?). Stop it first; share starts its own.`);
  }
}
const binary = cloudflaredPath();

// --- tunnels ---------------------------------------------------------------

log('opening tunnels…');
const [webUrl, apiUrl, emulatorUrl] = await Promise.all([
  tunnel('web', PORTS.web, binary),
  tunnel('api', PORTS.api, binary),
  tunnel('emulator', PORTS.emulator, binary),
]);

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
  env: { CORS_ORIGINS: `http://localhost:${PORTS.web},${webUrl}` },
});

log(`starting Expo web (${variant})…`);
start('expo', 'pnpm', ['exec', 'expo', 'start', '--web', '--clear', '--port', String(PORTS.web)], {
  cwd: path.join(root, 'apps/mobile'),
  shell: true,
  env: {
    CI: '1',
    BROWSER: 'none',
    APP_VARIANT: variant,
    // Process env wins over apps/mobile/.env, so the bundle gets the public URLs.
    EXPO_PUBLIC_WEB_API_URL: apiUrl,
    EXPO_PUBLIC_WEB_AUTH_EMULATOR_URL: emulatorUrl,
  },
});
await Promise.all([waitFor(PORTS.api, 'API'), waitFor(PORTS.web, 'Expo')]);

// Build the bundle once so the first phone visit doesn't wait on Metro.
log('warming the web bundle…');
const html = await fetch(`http://localhost:${PORTS.web}/`).then((r) => r.text());
const bundle = /<script src="([^"]+)"/.exec(html)?.[1];
if (bundle) await fetch(new URL(bundle, `http://localhost:${PORTS.web}`)).then((r) => r.text());

console.log(`
  Depanini (${variant}) is shared:

    App       ${webUrl}
    API       ${apiUrl}
    Emulator  ${emulatorUrl}

  Open the App link on your phone. Ctrl+C stops everything.
`);
