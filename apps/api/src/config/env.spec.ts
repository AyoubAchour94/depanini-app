import { parseEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://depanini:depanini@localhost:5432/depanini',
  FIREBASE_PROJECT_ID: 'depanini-dev',
};

describe('parseEnv', () => {
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

  it('fails fast with the offending variable named', () => {
    expect(() => parseEnv({ FIREBASE_PROJECT_ID: 'depanini-dev' })).toThrow(/DATABASE_URL/);
  });
});
