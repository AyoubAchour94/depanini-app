import { parseEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://depanini:depanini@localhost:5432/depanini',
  FIREBASE_PROJECT_ID: 'depanini-dev',
};

describe('parseEnv', () => {
  it('treats a missing or empty SENTRY_DSN as off', () => {
    expect(parseEnv(valid).SENTRY_DSN).toBeUndefined();
    expect(parseEnv({ ...valid, SENTRY_DSN: '' }).SENTRY_DSN).toBeUndefined();
    expect(parseEnv({ ...valid, SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1' }).SENTRY_DSN).toBe(
      'https://k@o1.ingest.sentry.io/1',
    );
  });

  it('applies defaults and coerces PORT', () => {
    expect(parseEnv(valid)).toMatchObject({ NODE_ENV: 'development', PORT: 3000 });
    expect(parseEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it('splits CORS_ORIGINS into a trimmed list', () => {
    expect(parseEnv(valid).CORS_ORIGINS).toEqual([]);
    expect(
      parseEnv({ ...valid, CORS_ORIGINS: 'http://a.test, http://b.test' }).CORS_ORIGINS,
    ).toEqual(['http://a.test', 'http://b.test']);
  });

  it('refuses the Auth emulator in production', () => {
    const emulator = { ...valid, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' };
    expect(parseEnv({ ...emulator, NODE_ENV: 'development' }).FIREBASE_AUTH_EMULATOR_HOST).toBe(
      '127.0.0.1:9099',
    );
    expect(() => parseEnv({ ...emulator, NODE_ENV: 'production' })).toThrow(
      /FIREBASE_AUTH_EMULATOR_HOST/,
    );
  });

  it('defaults pushes to the log sender, with the inbox off', () => {
    expect(parseEnv(valid)).toMatchObject({ PUSH_PROVIDER: 'log', PUSH_INBOX: false });
    expect(parseEnv({ ...valid, PUSH_INBOX: '1' }).PUSH_INBOX).toBe(true);
    expect(parseEnv({ ...valid, PUSH_INBOX: 'yes' }).PUSH_INBOX).toBe(false);
  });

  it('needs credentials for the fcm push provider', () => {
    const fcm = { ...valid, PUSH_PROVIDER: 'fcm' };
    expect(() => parseEnv(fcm)).toThrow(/GOOGLE_APPLICATION_CREDENTIALS/);
    expect(parseEnv({ ...fcm, GOOGLE_APPLICATION_CREDENTIALS: '/key.json' }).PUSH_PROVIDER).toBe(
      'fcm',
    );
    expect(parseEnv({ ...fcm, FIREBASE_SERVICE_ACCOUNT_JSON: '{}' }).PUSH_PROVIDER).toBe('fcm');
    expect(() => parseEnv({ ...valid, PUSH_PROVIDER: 'sms' })).toThrow(/PUSH_PROVIDER/);
  });

  it('defaults the hardening limits and coerces overrides', () => {
    expect(parseEnv(valid)).toMatchObject({
      TRUST_PROXY_HOPS: 1,
      THROTTLE_TTL_MS: 60_000,
      THROTTLE_LIMIT: 300,
      THROTTLE_WRITE_LIMIT: 60,
      UPLOAD_LIMIT_PER_HOUR: 20,
      UPLOAD_LIMIT_PER_DAY: 60,
      REQUEST_TIMEOUT_MS: 30_000,
      LOG_LEVEL: 'info',
    });
    expect(parseEnv({ ...valid, TRUST_PROXY_HOPS: '0', THROTTLE_LIMIT: '10' })).toMatchObject({
      TRUST_PROXY_HOPS: 0,
      THROTTLE_LIMIT: 10,
    });
    expect(() => parseEnv({ ...valid, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('fails fast with the offending variable named', () => {
    expect(() => parseEnv({ FIREBASE_PROJECT_ID: 'depanini-dev' })).toThrow(/DATABASE_URL/);
  });
});
