import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from './health';

describe('healthResponseSchema', () => {
  it('accepts a valid response', () => {
    const parsed = healthResponseSchema.parse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: 'up',
    });
    expect(parsed.status).toBe('ok');
  });

  it('rejects an unknown status', () => {
    expect(() =>
      healthResponseSchema.parse({ status: 'meh', timestamp: new Date().toISOString(), db: 'up' }),
    ).toThrow();
  });
});
