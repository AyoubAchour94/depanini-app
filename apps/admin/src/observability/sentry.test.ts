import { describe, expect, it, vi } from 'vitest';

import { initSentry } from './sentry';

const DSN = 'https://k@o1.ingest.sentry.io/1';

describe('initSentry', () => {
  it('does nothing without a DSN', () => {
    const sdk = { init: vi.fn() };
    expect(initSentry({}, sdk)).toBe(false);
    expect(initSentry({ VITE_SENTRY_DSN: '' }, sdk)).toBe(false);
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it('initialises with the release, the environment and no PII', () => {
    const sdk = { init: vi.fn() };
    expect(initSentry({ VITE_SENTRY_DSN: DSN, MODE: 'production' }, sdk)).toBe(true);
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        environment: 'production',
        release: expect.stringMatching(/^depanini-admin@\d/),
        dataCollection: expect.objectContaining({ userInfo: false, httpBodies: [] }),
        beforeSend: expect.any(Function),
      }),
    );
  });

  it('takes the environment from VITE_SENTRY_ENVIRONMENT when set', () => {
    const sdk = { init: vi.fn() };
    initSentry(
      { VITE_SENTRY_DSN: DSN, VITE_SENTRY_ENVIRONMENT: 'staging', MODE: 'production' },
      sdk,
    );
    expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({ environment: 'staging' }));
  });

  it('scrubs personal data in beforeSend', () => {
    const sdk = { init: vi.fn() };
    initSentry({ VITE_SENTRY_DSN: DSN }, sdk);
    const { beforeSend } = sdk.init.mock.calls[0]![0];
    expect(
      beforeSend({
        message: 'call +216 22 333 444',
        user: { id: 'u1', email: 'a@b.tn', ip_address: '1.2.3.4' },
        request: { headers: { Authorization: 'Bearer x' }, data: 'bytes' },
      }),
    ).toEqual({ message: 'call [phone]', user: { id: 'u1' }, request: { headers: {} } });
  });
});
