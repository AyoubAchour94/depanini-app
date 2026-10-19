import assert from 'node:assert/strict';
import { test } from 'node:test';

import { grantAdmin, grantTarget, parseArgs } from './admin-grant.mjs';

test('uses the emulator when its host is set', () => {
  assert.equal(grantTarget({ emulatorHost: '127.0.0.1:9099' }), 'emulator');
  assert.equal(grantTarget({ emulatorHost: '127.0.0.1:9099', yesRealProject: true }), 'emulator');
});

test('refuses a real project without --yes-real-project', () => {
  for (const emulatorHost of [undefined, '']) {
    assert.throws(() => grantTarget({ emulatorHost }), /REAL Firebase project/);
    assert.throws(() => grantTarget({ emulatorHost, yesRealProject: false }), /REAL/);
  }
});

test('allows a real project only with --yes-real-project', () => {
  assert.equal(grantTarget({ emulatorHost: undefined, yesRealProject: true }), 'real');
});

test('grantAdmin refuses before touching Firebase', async () => {
  await assert.rejects(
    grantAdmin('someone@example.com', { emulatorHost: '', projectId: 'depanini-prod' }),
    /REAL Firebase project/,
  );
});

test('parses the email and flags', () => {
  assert.deepEqual(parseArgs(['a@b.c']), {
    email: 'a@b.c',
    revoke: false,
    projectId: undefined,
    yesRealProject: false,
  });
  assert.deepEqual(parseArgs(['--revoke', 'a@b.c', '--project', 'p1', '--yes-real-project']), {
    email: 'a@b.c',
    revoke: true,
    projectId: 'p1',
    yesRealProject: true,
  });
});

test('rejects a missing email, unknown options and extra arguments', () => {
  assert.throws(() => parseArgs([]), /Usage/);
  assert.throws(() => parseArgs(['a@b.c', '--force']), /Unknown option/);
  assert.throws(() => parseArgs(['a@b.c', 'd@e.f']), /Unexpected/);
  assert.throws(() => parseArgs(['a@b.c', '--project']), /project id/);
});
