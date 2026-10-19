import assert from 'node:assert/strict';
import { test } from 'node:test';

import { corsOrigins, planApps } from './share-plan.mjs';

test('user and driver start one app on 8081, as before', () => {
  assert.deepEqual(planApps('user'), [{ variant: 'user', port: 8081 }]);
  assert.deepEqual(planApps('driver'), [{ variant: 'driver', port: 8081 }]);
});

test('both starts the customer on 8081 and the driver on 8082', () => {
  assert.deepEqual(planApps('both'), [
    { variant: 'user', port: 8081 },
    { variant: 'driver', port: 8082 },
  ]);
});

test('CORS lists the localhost and public origin of every app', () => {
  const urls = { user: 'https://u.trycloudflare.com', driver: 'https://d.trycloudflare.com' };
  assert.deepEqual(corsOrigins(planApps('both'), urls), [
    'http://localhost:8081',
    'https://u.trycloudflare.com',
    'http://localhost:8082',
    'https://d.trycloudflare.com',
  ]);
  assert.deepEqual(corsOrigins(planApps('driver'), urls), [
    'http://localhost:8081',
    'https://d.trycloudflare.com',
  ]);
});

test('admin starts the admin web app on 5173, and is not part of both', () => {
  assert.deepEqual(planApps('admin'), [{ variant: 'admin', port: 5173 }]);
  assert.ok(!planApps('both').some((app) => app.variant === 'admin'));
  assert.deepEqual(corsOrigins(planApps('admin'), { admin: 'https://a.trycloudflare.com' }), [
    'http://localhost:5173',
    'https://a.trycloudflare.com',
  ]);
});
