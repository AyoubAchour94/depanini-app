// End-to-end flow check against a running stack (API + Auth emulator + Postgres).
// Creates two throwaway emulator accounts, walks the customer + driver flow over
// HTTP, checks every response against the @depanini/shared schemas, then deletes
// both accounts. See README "End-to-end flow check".
//
// To add a step, append `{ name, run(ctx) }` to STEPS. Steps run in order and share `ctx`.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
// Built shared package (`pnpm --filter @depanini/shared build`).
const shared = require('../../packages/shared/dist/index.js');

const API = (process.env.E2E_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMULATOR = (process.env.E2E_AUTH_EMULATOR ?? 'http://127.0.0.1:9099').replace(/\/$/, '');
/** `E2E_WS=off` skips the WebSocket checks (e.g. against an API without `/ws`). */
const WS = process.env.E2E_WS !== 'off';
/** How long a `/ws` event may take to arrive after the change that causes it. */
const WS_EVENT_MS = 2000;
const run = Date.now().toString(36);

const TUNIS_PICKUP = {
  latitude: 36.8065,
  longitude: 10.1815,
  address: 'Avenue Habib Bourguiba, Tunis',
};
const TUNIS_DROPOFF = { latitude: 36.8625, longitude: 10.1956, address: 'La Marsa, Tunis' };
/** Where the driver is once on the way: close to the pickup, so the ETA is a few minutes. */
const DRIVER_NEAR_PICKUP = { latitude: TUNIS_PICKUP.latitude + 0.01, longitude: 10.1815 };

/** A fetch against the API as `user`; checks the status and, if given, the response schema. */
async function api(user, method, path, { body, expect = 200, schema } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${user.idToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  assert.equal(
    res.status,
    expect,
    `${method} ${path}: expected ${expect}, got ${res.status} ${text}`,
  );
  if (schema) {
    const parsed = schema.safeParse(json);
    assert.ok(parsed.success, `${method} ${path}: response does not match schema: ${parsed.error}`);
  }
  return json;
}

/**
 * Opens `/ws` as `user` (Node's built-in WebSocket) and authenticates. Every message
 * must match `wsServerMessageSchema`; `next` takes the oldest one matching `test`.
 */
async function openRealtime(user) {
  const socket = new WebSocket(`${API.replace(/^http/, 'ws')}/ws`);
  const inbox = [];
  const waiters = new Set();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data));
    const parsed = shared.wsServerMessageSchema.safeParse(message);
    inbox.push(parsed.success ? message : { type: 'invalid', message, error: parsed.error });
    for (const wake of waiters) wake();
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('could not connect to /ws')), {
      once: true,
    });
  });

  const next = (what, test, timeoutMs = WS_EVENT_MS) =>
    new Promise((resolve, reject) => {
      const look = () => {
        const invalid = inbox.find((message) => message.type === 'invalid');
        const index = invalid ? -1 : inbox.findIndex(test);
        if (!invalid && index === -1) return false;
        waiters.delete(look);
        clearTimeout(timer);
        if (invalid) reject(new Error(`/ws sent an invalid message: ${invalid.error}`));
        else resolve(inbox.splice(index, 1)[0]);
        return true;
      };
      const timer = setTimeout(() => {
        waiters.delete(look);
        reject(new Error(`no ${what} on /ws within ${timeoutMs} ms`));
      }, timeoutMs);
      if (!look()) waiters.add(look);
    });

  socket.send(JSON.stringify({ type: 'auth', token: user.idToken }));
  await next('auth.ok', (message) => message.type === 'auth.ok');
  return { next, close: () => socket.close() };
}

async function signUp(label) {
  const res = await fetch(
    `${EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `e2e-${label}-${run}@example.test`,
        password: 'e2e-password-1',
        returnSecureToken: true,
      }),
    },
  );
  const text = await res.text();
  assert.equal(res.status, 200, `emulator signUp failed: ${res.status} ${text}`);
  return JSON.parse(text);
}

async function deleteEmulatorUser(user) {
  await fetch(`${EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:delete?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: user.idToken }),
  });
}

const STEPS = [
  {
    name: 'sign up customer and driver in the Auth emulator',
    async run(ctx) {
      ctx.customer = await signUp('customer');
      ctx.driver = await signUp('driver');
    },
  },
  {
    name: 'GET /me creates both accounts without profiles',
    async run({ customer, driver }) {
      for (const user of [customer, driver]) {
        const me = await api(user, 'GET', '/me', { schema: shared.meResponseSchema });
        assert.equal(me.customerProfile, null);
        assert.equal(me.driverProfile, null);
      }
    },
  },
  {
    name: 'save the customer profile',
    async run({ customer }) {
      const profile = await api(customer, 'PUT', '/me/customer-profile', {
        body: { fullName: 'E2E Customer', phone: '+21620000001' },
        schema: shared.customerProfileSchema,
      });
      assert.equal(profile.phone, '+21620000001');
      const me = await api(customer, 'GET', '/me', { schema: shared.meResponseSchema });
      assert.equal(me.customerProfile?.fullName, 'E2E Customer');
    },
  },
  {
    name: 'save the driver profile',
    async run({ driver }) {
      const profile = await api(driver, 'PUT', '/me/driver-profile', {
        body: {
          fullName: 'E2E Driver',
          phone: '+21620000002',
          truckType: 'flatbed',
          plateNumber: ' 123 tu 4567 ',
        },
        schema: shared.driverProfileSchema,
      });
      assert.equal(profile.plateNumber, '123 TU 4567');
    },
  },
  {
    name: 'estimate the fare',
    async run(ctx) {
      ctx.estimate = await api(ctx.customer, 'POST', '/tow-requests/estimate', {
        body: { pickup: TUNIS_PICKUP, dropoff: TUNIS_DROPOFF, vehicleType: 'car' },
        schema: shared.fareEstimateSchema,
      });
      assert.ok(ctx.estimate.minFare <= ctx.estimate.suggestedFare);
      assert.ok(ctx.estimate.suggestedFare <= ctx.estimate.maxFare);
    },
  },
  {
    name: 'create a tow request',
    async run(ctx) {
      const request = await api(ctx.customer, 'POST', '/tow-requests', {
        expect: 201,
        body: {
          pickup: TUNIS_PICKUP,
          dropoff: TUNIS_DROPOFF,
          vehicleType: 'car',
          problemType: 'breakdown',
          note: `e2e ${run}`,
          proposedFare: ctx.estimate.suggestedFare,
        },
        schema: shared.towRequestSchema,
      });
      assert.equal(request.status, 'open');
      ctx.request = request;
    },
  },
  {
    name: 'driver goes online near the pickup and sees the request nearby',
    async run(ctx) {
      const presence = await api(ctx.driver, 'PUT', '/driver/presence', {
        body: {
          online: true,
          location: { latitude: TUNIS_PICKUP.latitude + 0.002, longitude: TUNIS_PICKUP.longitude },
        },
        schema: shared.driverPresenceSchema,
      });
      assert.equal(presence.online, true);
      const nearby = await api(ctx.driver, 'GET', '/driver/requests/nearby');
      assert.ok(Array.isArray(nearby));
      for (const item of nearby) assert.ok(shared.nearbyRequestSchema.safeParse(item).success);
      assert.ok(
        nearby.some((item) => item.id === ctx.request.id),
        'the new request is not in nearby',
      );
    },
  },
  {
    name: 'driver counter-offers and the customer sees the offer',
    async run(ctx) {
      const { suggestedFare, minFare, maxFare } = ctx.estimate;
      const counter =
        suggestedFare + 1 <= maxFare ? suggestedFare + 1 : Math.max(minFare, suggestedFare - 1);
      const offer = await api(ctx.driver, 'POST', `/tow-requests/${ctx.request.id}/offers`, {
        expect: 201,
        body: { fare: counter },
        schema: shared.offerSchema,
      });
      assert.equal(offer.status, 'pending');
      assert.equal(offer.fare, counter);
      ctx.offer = offer;

      const offers = await api(ctx.customer, 'GET', `/tow-requests/${ctx.request.id}/offers`);
      assert.ok(Array.isArray(offers));
      for (const item of offers) assert.ok(shared.customerOfferSchema.safeParse(item).success);
      assert.ok(
        offers.some((item) => item.id === offer.id),
        'the customer does not see the offer',
      );
    },
  },
  ...(WS
    ? [
        {
          name: 'customer connects to /ws and authenticates',
          async run(ctx) {
            ctx.realtime = await openRealtime(ctx.customer);
          },
        },
      ]
    : []),
  {
    name: `customer accepts the offer${WS ? '; request.updated arrives on /ws' : ''}`,
    async run(ctx) {
      const request = await api(ctx.customer, 'POST', `/offers/${ctx.offer.id}/accept`, {
        schema: shared.towRequestSchema,
      });
      assert.equal(request.status, 'assigned');
      assert.equal(request.agreedFare, ctx.offer.fare);
      if (ctx.realtime) {
        const { request: pushed } = await ctx.realtime.next(
          'request.updated (assigned)',
          (m) => m.type === 'request.updated' && m.request.status === 'assigned',
        );
        assert.equal(pushed.id, ctx.request.id);
        assert.equal(pushed.driver?.fullName, 'E2E Driver');
      }
    },
  },
  {
    name: 'customer active request is assigned with driver contact',
    async run(ctx) {
      const active = await api(ctx.customer, 'GET', '/tow-requests/active', {
        schema: shared.towRequestSchema,
      });
      assert.equal(active.id, ctx.request.id);
      assert.equal(active.status, 'assigned');
      assert.equal(active.driver?.fullName, 'E2E Driver');
      assert.equal(active.driver?.phone, '+21620000002');
    },
  },
  {
    name: 'driver job has the customer contact',
    async run(ctx) {
      const job = await api(ctx.driver, 'GET', '/driver/job', { schema: shared.driverJobSchema });
      assert.equal(job.id, ctx.request.id);
      assert.equal(job.customer.fullName, 'E2E Customer');
      assert.equal(job.customer.phone, '+21620000001');
    },
  },
  {
    name: 'driver job starts at the accepted stage',
    async run(ctx) {
      const job = await api(ctx.driver, 'GET', '/driver/job', { schema: shared.driverJobSchema });
      assert.equal(job.tripStage, 'accepted');
      const active = await api(ctx.customer, 'GET', '/tow-requests/active', {
        schema: shared.towRequestSchema,
      });
      assert.equal(active.tripStage, 'accepted');
    },
  },
  {
    name: 'driver skipping a stage is rejected',
    async run(ctx) {
      await api(ctx.driver, 'POST', '/driver/job/stage', {
        expect: 409,
        body: { stage: 'towing' },
      });
    },
  },
  {
    name: 'driver starts driving; the customer sees the truck and an ETA to the pickup',
    async run(ctx) {
      const job = await api(ctx.driver, 'POST', '/driver/job/stage', {
        body: { stage: 'en_route' },
        schema: shared.driverJobSchema,
      });
      assert.equal(job.tripStage, 'en_route');
      assert.ok(job.enRouteAt);
      if (ctx.realtime) {
        const { request: pushed } = await ctx.realtime.next(
          'request.updated (en_route)',
          (m) => m.type === 'request.updated' && m.request.tripStage === 'en_route',
        );
        assert.equal(pushed.id, ctx.request.id);
      }
      await api(ctx.driver, 'PUT', '/driver/presence', {
        body: { online: true, location: DRIVER_NEAR_PICKUP },
        schema: shared.driverPresenceSchema,
      });
      const active = await api(ctx.customer, 'GET', '/tow-requests/active', {
        schema: shared.towRequestSchema,
      });
      assert.equal(active.tripStage, 'en_route');
      assert.equal(active.driverLocation?.latitude, DRIVER_NEAR_PICKUP.latitude);
      assert.ok(active.etaMin >= 1, 'no ETA to the pickup');
    },
  },
  {
    name: 'driver arrives; the ETA goes away',
    async run(ctx) {
      const job = await api(ctx.driver, 'POST', '/driver/job/stage', {
        body: { stage: 'arrived' },
        schema: shared.driverJobSchema,
      });
      assert.equal(job.tripStage, 'arrived');
      const active = await api(ctx.customer, 'GET', '/tow-requests/active', {
        schema: shared.towRequestSchema,
      });
      assert.equal(active.tripStage, 'arrived');
      assert.ok(active.arrivedAt);
      assert.equal(active.etaMin ?? null, null);
    },
  },
  {
    name: 'vehicle is loaded; the ETA is now to the drop-off and nobody can cancel',
    async run(ctx) {
      const job = await api(ctx.driver, 'POST', '/driver/job/stage', {
        body: { stage: 'towing' },
        schema: shared.driverJobSchema,
      });
      assert.equal(job.tripStage, 'towing');
      const active = await api(ctx.customer, 'GET', '/tow-requests/active', {
        schema: shared.towRequestSchema,
      });
      assert.equal(active.tripStage, 'towing');
      assert.ok(active.towingAt);
      assert.ok(active.etaMin >= 1, 'no ETA to the drop-off');
      const cancel = `/tow-requests/${ctx.request.id}/cancel`;
      await api(ctx.customer, 'POST', cancel, { expect: 409, body: { reason: 'other' } });
      await api(ctx.driver, 'POST', cancel, { expect: 409, body: { reason: 'other' } });
    },
  },
  {
    name: 'driver drops off; the request completes in both histories',
    async run(ctx) {
      const completed = await api(ctx.driver, 'POST', '/driver/job/complete', {
        schema: shared.towRequestSchema,
      });
      assert.equal(completed.status, 'completed');
      assert.ok(completed.completedAt);
      await api(ctx.driver, 'GET', '/driver/job', { expect: 204 });
      // The customer still gets the completed request for a few minutes, for the summary.
      const active = await api(ctx.customer, 'GET', '/tow-requests/active', {
        schema: shared.towRequestSchema,
      });
      assert.equal(active.id, ctx.request.id);
      assert.equal(active.status, 'completed');
      assert.equal(active.driverLocation ?? null, null);
      const history = await api(ctx.customer, 'GET', '/tow-requests', {
        schema: shared.towRequestPageSchema,
      });
      assert.equal(history.items.find((item) => item.id === ctx.request.id)?.status, 'completed');
    },
  },
  {
    name: 'a second request is accepted and the driver cancels it, which needs a reason',
    async run(ctx) {
      const request = await api(ctx.customer, 'POST', '/tow-requests', {
        expect: 201,
        body: {
          pickup: TUNIS_PICKUP,
          dropoff: TUNIS_DROPOFF,
          vehicleType: 'car',
          problemType: 'breakdown',
          note: `e2e ${run} again`,
          proposedFare: ctx.estimate.suggestedFare,
        },
        schema: shared.towRequestSchema,
      });
      const offer = await api(ctx.driver, 'POST', `/tow-requests/${request.id}/offers`, {
        expect: 201,
        body: { fare: ctx.estimate.suggestedFare },
        schema: shared.offerSchema,
      });
      await api(ctx.customer, 'POST', `/offers/${offer.id}/accept`, {
        schema: shared.towRequestSchema,
      });

      const cancel = `/tow-requests/${request.id}/cancel`;
      await api(ctx.driver, 'POST', cancel, { expect: 400 });
      await api(ctx.driver, 'POST', cancel, { expect: 400, body: { reason: 'driver_late' } });
      const cancelled = await api(ctx.driver, 'POST', cancel, {
        body: { reason: 'truck_problem' },
        schema: shared.towRequestSchema,
      });
      assert.equal(cancelled.status, 'cancelled');
      assert.equal(cancelled.cancelledBy, 'driver');
      assert.equal(cancelled.cancelReason, 'truck_problem');
      await api(ctx.driver, 'GET', '/driver/job', { expect: 204 });
      // Only the first, completed request is left (it shows for 10 minutes).
      const active = await api(ctx.customer, 'GET', '/tow-requests/active', {
        schema: shared.towRequestSchema,
      });
      assert.equal(active.id, ctx.request.id);
      const history = await api(ctx.customer, 'GET', '/tow-requests', {
        schema: shared.towRequestPageSchema,
      });
      assert.equal(history.items.find((item) => item.id === request.id)?.status, 'cancelled');
    },
  },
];

/** Runs whether the flow passed or failed, so no data is left behind. */
async function cleanup(ctx) {
  ctx.realtime?.close();
  const problems = [];
  for (const user of [ctx.customer, ctx.driver]) {
    if (!user) continue;
    try {
      await api(user, 'DELETE', '/me', { expect: 204 });
    } catch (error) {
      problems.push(error.message);
    }
    await deleteEmulatorUser(user).catch(() => {});
  }
  return problems;
}

async function main() {
  console.log(`API ${API}, Auth emulator ${EMULATOR}`);
  const ctx = {};
  let failed = false;
  for (const step of STEPS) {
    const started = performance.now();
    try {
      await step.run(ctx);
      console.log(`✓ ${step.name} (${Math.round(performance.now() - started)} ms)`);
    } catch (error) {
      console.log(`✗ ${step.name} (${Math.round(performance.now() - started)} ms)`);
      console.log(`  ${error.message}`);
      failed = true;
      break;
    }
  }

  const started = performance.now();
  const problems = await cleanup(ctx);
  const took = `${Math.round(performance.now() - started)} ms`;
  if (problems.length) {
    console.log(`✗ cleanup: DELETE /me for both accounts (${took})`);
    for (const problem of problems) console.log(`  ${problem}`);
  } else {
    console.log(`✓ cleanup: DELETE /me for both accounts (${took})`);
  }
  if (failed || problems.length) process.exit(1);
  console.log('All steps passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
