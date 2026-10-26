import { describe, expect, it } from 'vitest';

import { scrubSentryEvent, scrubText } from './sentry-scrub';

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

  describe('text masking', () => {
    const scrubbed = (message: string) => scrubSentryEvent({ message }).message;

    it('masks local Tunisian numbers written in groups or after a label', () => {
      expect(scrubbed('call 20 123 456 now')).toBe('call [phone] now');
      expect(scrubbed('tel: 98.765.432')).toBe('tel: [phone]');
      expect(scrubbed('99-11-22-33')).toBe('[phone]');
      expect(scrubbed('phone 2012-3456.')).toBe('phone [phone].');
      expect(scrubbed('Tel 55123456')).toBe('Tel [phone]');
    });

    it('masks IPv4 and IPv6 addresses', () => {
      expect(scrubbed('from 41.226.10.7 failed')).toBe('from [ip] failed');
      expect(scrubbed('connect ECONNREFUSED 10.0.0.1:5432')).toBe('connect ECONNREFUSED [ip]:5432');
      expect(scrubbed('client 2001:0db8:85a3:0000:0000:8a2e:0370:7334 up')).toBe('client [ip] up');
      expect(scrubbed('client 2a01:e0a::1 and ::1 and fe80::1ff:fe23:4567:890a')).toBe(
        'client [ip] and [ip] and [ip]',
      );
    });

    it('masks token and key URL parameters but keeps the others', () => {
      expect(scrubbed('GET /x?page=2&token=abc123&sort=asc')).toBe(
        'GET /x?page=2&token=[token]&sort=asc',
      );
      expect(scrubbed('https://h/p?apiKey=k-1&idToken=zz')).toBe(
        'https://h/p?apiKey=[token]&idToken=[token]',
      );
      expect(scrubbed('/search?q=tow&limit=20')).toBe('/search?q=tow&limit=20');
    });

    it('masks bare JWTs', () => {
      const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2ln-na_ture';
      expect(scrubbed(`id token ${jwt} rejected`)).toBe('id token [token] rejected');
    });

    it('leaves prices, ids, receipt numbers, times and versions alone', () => {
      for (const text of [
        'fare 85 TND',
        'fare 85.500 TND for 12 km',
        'total 1 250 000 TND',
        'request 6f1c2b8e-1234-4abc-9def-0123456789ab failed',
        'receipt DPN-2026-000123',
        'order 20240101 at 12:30:45',
        'order 20240101',
        'version 1.2.3 build 456',
        'std::string and Foo::bar',
        'plate 123 TUN 4567',
      ]) {
        expect(scrubbed(text)).toBe(text);
      }
    });
  });

  describe('long strings', () => {
    const fastestMs = (text: string) => {
      scrubText(text);
      let best = Number.POSITIVE_INFINITY;
      for (let run = 0; run < 3; run++) {
        const started = performance.now();
        scrubText(text);
        best = Math.min(best, performance.now() - started);
      }
      return best;
    };

    it('scrubs a 100k-character numeric string in under 50 ms', () => {
      expect(fastestMs('1.'.repeat(50000))).toBeLessThan(50);
    });

    it('truncates text past 2000 characters with a marker and masks only what is kept', () => {
      // No delimiter in the last 200 characters of the window, so the cut is 200 characters early.
      const text = `a@b.tn ${'x'.repeat(1993)} c@d.tn`;
      expect(scrubText(text)).toBe(`[email] ${'x'.repeat(1793)}…[truncated]`);
    });

    it('cuts back to the last delimiter so a JWT straddling the cut leaves no fragment', () => {
      const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2ln-na_ture';
      const text = `${'x '.repeat(997)}${jwt} rest`;
      expect(scrubText(text)).toBe(`${'x '.repeat(997)}…[truncated]`);
    });

    it('cuts back to the last delimiter so an email straddling the cut leaves no fragment', () => {
      const text = `${'x '.repeat(997)}amine@example.com and more`;
      expect(scrubText(text)).toBe(`${'x '.repeat(997)}…[truncated]`);
    });

    it('drops a JWT straddling the cut when no delimiter is near it', () => {
      const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2ln-na_ture';
      const text = `${'x'.repeat(1950)}${jwt}${'y'.repeat(100)}`;
      const scrubbed = scrubText(text);
      expect(scrubbed).not.toMatch(/eyJ|\.|c2ln|na_ture/);
      expect(scrubbed).toBe(`${'x'.repeat(1800)}…[truncated]`);
    });

    it('drops an email straddling the cut when no delimiter is near it', () => {
      const text = `${'x'.repeat(1950)}amine@example.com${'y'.repeat(100)}`;
      expect(scrubText(text)).toBe(`${'x'.repeat(1800)}…[truncated]`);
    });

    it('leaves text of 2000 characters or less unchanged', () => {
      const text = 'z'.repeat(2000);
      expect(scrubText(text)).toBe(text);
    });
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
