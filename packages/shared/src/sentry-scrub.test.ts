import { describe, expect, it } from 'vitest';

import { scrubSentryEvent } from './sentry-scrub';

describe('scrubSentryEvent', () => {
  it('drops the credentials and network identity from the request', () => {
    const event = scrubSentryEvent({
      request: {
        url: 'https://api.depanini.tn/me',
        headers: {
          Authorization: 'Bearer abc.def.ghi',
          cookie: 'session=1',
          'X-Forwarded-For': '41.0.0.1',
          'content-type': 'application/json',
        },
        cookies: { session: '1' },
      },
    });
    expect(event.request?.headers).toEqual({ 'content-type': 'application/json' });
    expect(event.request).not.toHaveProperty('cookies');
    expect(event.request?.url).toBe('https://api.depanini.tn/me');
  });

  it('drops request bodies, such as a document upload', () => {
    const event = scrubSentryEvent({
      request: { method: 'POST', url: 'https://api/x', data: '--boundary\r\nJPEGBYTES' },
    });
    expect(event.request).toEqual({ method: 'POST', url: 'https://api/x' });
  });

  it('keeps only the id of the user', () => {
    const event = scrubSentryEvent({
      user: { id: 'uid-1', email: 'a@b.tn', ip_address: '41.0.0.1', username: 'amine' },
    });
    expect(event.user).toEqual({ id: 'uid-1' });
  });

  it('masks emails, Tunisian phone numbers and bearer tokens inside text', () => {
    const event = scrubSentryEvent({
      message: 'sign-in failed for amine@example.com',
      exception: {
        values: [
          { value: 'cannot call +216 22 333 444 or +21655111222 with Bearer eyJhbGciOi.abc-1_2' },
        ],
      },
      breadcrumbs: [{ message: 'GET /search?q=a.b@c.io&n=%2B21622333444' }],
    });
    expect(event.message).toBe('sign-in failed for [email]');
    expect(event.exception?.values[0]?.value).toBe(
      'cannot call [phone] or [phone] with Bearer [token]',
    );
    expect(event.breadcrumbs?.[0]?.message).toBe('GET /search?q=[email]&n=[phone]');
  });

  it('drops sensitive keys anywhere in the event', () => {
    const event = scrubSentryEvent({
      extra: {
        email: 'a@b.tn',
        phoneNumber: '+21622333444',
        retries: 2,
        nested: { token: 't', ok: 1 },
      },
    });
    expect(event.extra).toEqual({ retries: 2, nested: { ok: 1 } });
  });

  it('does not change the event it was given', () => {
    const original = { user: { id: '1', email: 'a@b.tn' } };
    scrubSentryEvent(original);
    expect(original.user.email).toBe('a@b.tn');
  });

  it('survives circular references', () => {
    const extra: Record<string, unknown> = { a: 1 };
    extra.self = extra;
    expect(() => scrubSentryEvent({ extra })).not.toThrow();
  });
});
