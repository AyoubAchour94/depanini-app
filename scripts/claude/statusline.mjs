#!/usr/bin/env node
// Claude Code status line. Prints a short line, and saves the subscription
// rate-limit data Claude Code passes in so `usage.mjs` (and the orchestrator)
// can read it. Claude Code only sends `rate_limits` to Pro/Max sessions, after
// the first API response.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATE = join(dirname(fileURLToPath(import.meta.url)), '../../.claude/state/usage.json');

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  // Bad or empty input: still print something.
}

const limits = input.rate_limits ?? {};
if (limits.five_hour || limits.seven_day) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(
    STATE,
    JSON.stringify({ savedAt: Math.floor(Date.now() / 1000), ...limits }, null, 2),
  );
}

const pct = (w) => (w?.used_percentage == null ? '–' : `${Math.round(w.used_percentage)}%`);
const ctx = input.context_window?.used_percentage;
console.log(
  [
    input.model?.display_name ?? 'Claude',
    `5h ${pct(limits.five_hour)}`,
    `7d ${pct(limits.seven_day)}`,
    ctx == null ? null : `ctx ${Math.round(ctx)}%`,
  ]
    .filter(Boolean)
    .join(' · '),
);
