import { initSentry } from './sentry';
import { initSentryWith } from './sentry-core';

const mockSdkInit = jest.fn();
jest.mock('@sentry/react-native', () => ({
  init: (...args: unknown[]) => mockSdkInit(...args),
  wrap: (component: unknown) => component,
}));

const DSN = 'https://k@o1.ingest.sentry.io/1';
const settings = { dsn: DSN, environment: 'prod', release: 'com.depanini.app@1.0.0' };

describe('initSentryWith', () => {
  it('does nothing without a DSN', () => {
    const sdk = { init: jest.fn() };
    expect(initSentryWith(sdk, { ...settings, dsn: undefined })).toBe(false);
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it('initialises with the release, the environment and no default PII', () => {
    const sdk = { init: jest.fn() };
    expect(initSentryWith(sdk, settings)).toBe(true);
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        environment: 'prod',
        release: 'com.depanini.app@1.0.0',
        sendDefaultPii: false,
        beforeSend: expect.any(Function),
      }),
    );
  });

  it('scrubs personal data in beforeSend', () => {
    const sdk = { init: jest.fn() };
    initSentryWith(sdk, settings);
    const { beforeSend } = sdk.init.mock.calls[0][0];
    expect(
      beforeSend({
        message: 'sign-in failed for a@b.tn, +216 22 333 444',
        user: { id: 'u1', email: 'a@b.tn', ip_address: '1.2.3.4' },
        request: { headers: { authorization: 'Bearer x' }, data: 'document bytes' },
      }),
    ).toEqual({
      message: 'sign-in failed for [email], [phone]',
      user: { id: 'u1' },
      request: { headers: {} },
    });
  });
});

describe('initSentry without EXPO_PUBLIC_SENTRY_DSN', () => {
  it('stays off and does not touch the SDK', () => {
    expect(initSentry()).toBe(false);
    expect(mockSdkInit).not.toHaveBeenCalled();
  });
});
