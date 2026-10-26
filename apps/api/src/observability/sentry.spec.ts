import { HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { captureException } from '@sentry/nestjs';

import { SentryExceptionFilter, initSentry, shouldReport } from './sentry.js';

vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn(), init: vi.fn() }));

const DSN = 'https://k@o1.ingest.sentry.io/1';

describe('initSentry', () => {
  it('does nothing without a DSN', () => {
    const sdk = { init: vi.fn() };
    expect(initSentry({ NODE_ENV: 'production' }, sdk)).toBe(false);
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it('initialises with the release, the environment and no PII', () => {
    const sdk = { init: vi.fn() };
    expect(initSentry({ SENTRY_DSN: DSN, NODE_ENV: 'production' }, sdk)).toBe(true);
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        environment: 'production',
        release: expect.stringMatching(/^depanini-api@/),
        dataCollection: expect.objectContaining({ userInfo: false, httpBodies: [] }),
        beforeSend: expect.any(Function),
      }),
    );
  });

  it('prefers SENTRY_ENVIRONMENT over NODE_ENV', () => {
    const sdk = { init: vi.fn() };
    initSentry({ SENTRY_DSN: DSN, SENTRY_ENVIRONMENT: 'staging', NODE_ENV: 'production' }, sdk);
    expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({ environment: 'staging' }));
  });

  it('scrubs personal data in beforeSend', () => {
    const sdk = { init: vi.fn() };
    initSentry({ SENTRY_DSN: DSN, NODE_ENV: 'production' }, sdk);
    const { beforeSend } = sdk.init.mock.calls[0]![0];
    const event = beforeSend({
      message: 'failed for a@b.tn',
      user: { id: 'u1', ip_address: '41.0.0.1' },
      request: { headers: { authorization: 'Bearer x.y' }, data: 'file bytes' },
    });
    expect(event).toEqual({
      message: 'failed for [email]',
      user: { id: 'u1' },
      request: { headers: {} },
    });
  });
});

describe('shouldReport', () => {
  it('reports unexpected errors and 5xx responses, not 4xx', () => {
    expect(shouldReport(new Error('boom'))).toBe(true);
    expect(shouldReport(new ServiceUnavailableException())).toBe(true);
    expect(shouldReport(new HttpException('x', 502))).toBe(true);
    expect(shouldReport(new NotFoundException())).toBe(false);
    expect(shouldReport(new HttpException('x', 429))).toBe(false);
  });
});

describe('SentryExceptionFilter', () => {
  const host = {} as never;
  beforeEach(() => {
    vi.mocked(captureException).mockClear();
    vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('captures a 5xx and still answers through the default filter', () => {
    const filter = new SentryExceptionFilter();
    const error = new Error('boom');
    filter.catch(error, host);
    expect(captureException).toHaveBeenCalledWith(error);
    expect(BaseExceptionFilter.prototype.catch).toHaveBeenCalledWith(error, host);
  });

  it('does not capture a 4xx', () => {
    new SentryExceptionFilter().catch(new NotFoundException(), host);
    expect(captureException).not.toHaveBeenCalled();
    expect(BaseExceptionFilter.prototype.catch).toHaveBeenCalled();
  });
});
