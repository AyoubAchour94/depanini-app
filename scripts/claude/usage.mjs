#!/usr/bin/env node
// Budget check for the orchestrator: `node scripts/claude/usage.mjs`.
// Reads what statusline.mjs saved and prints one verdict line plus JSON:
//
//   GO     plenty left, swarm freely
//   SLOW   finish what is in flight, at most one new worker, cheaper models
//   PAUSE  start nothing; sleep until `resumeAt`
//   UNKNOWN no data yet (statusline not configured, or no API call yet)
//
// The 5-hour window is a hard stop near the cap. The 7-day window is paced:
// usage may run ahead of the share of the week that has passed only by a margin.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATE = join(dirname(fileURLToPath(import.meta.url)), '../../.claude/state/usage.json');
const WEEK = 7 * 24 * 3600;
const now = Math.floor(Date.now() / 1000);

let state;
let five;
let week;
try {
  state = JSON.parse(readFileSync(STATE, 'utf8'));
} catch {
  report(
    'UNKNOWN',
    'no usage data yet: run /usage, or send one message so the status line refreshes',
  );
}

// A window whose reset time has passed has started over.
const live = (w) => (w && w.resets_at > now ? w : { used_percentage: 0, resets_at: null });
five = live(state.five_hour);
week = live(state.seven_day);

const weekElapsed = week.resets_at ? 1 - (week.resets_at - now) / WEEK : 0;
const weekAhead = week.used_percentage - weekElapsed * 100;

if (week.used_percentage >= 90) {
  report('PAUSE', 'weekly limit nearly used', week.resets_at);
} else if (five.used_percentage >= 88) {
  report('PAUSE', '5-hour limit nearly used', five.resets_at);
} else if (five.used_percentage >= 70 || weekAhead > 15) {
  report('SLOW', weekAhead > 15 ? 'weekly usage running ahead of pace' : '5-hour window past 70%');
} else {
  report('GO', 'within budget');
}

function report(verdict, reason, resumeAt = null) {
  const out = {
    verdict,
    reason,
    fiveHourPct: five?.used_percentage ?? null,
    fiveHourResetsAt: iso(five?.resets_at),
    weekPct: week?.used_percentage ?? null,
    weekResetsAt: iso(week?.resets_at),
    resumeAt: iso(resumeAt && resumeAt + 120), // a little slack after the reset
    dataAgeSec: state ? now - state.savedAt : null,
  };
  console.log(`${verdict}: ${reason}`);
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

function iso(sec) {
  return sec ? new Date(sec * 1000).toISOString() : null;
}
