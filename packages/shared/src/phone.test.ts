import { describe, expect, it } from 'vitest';

import { tunisianPhoneSchema } from './phone';

describe('tunisianPhoneSchema', () => {
  it.each([
    ['+21698123456', '+21698123456'],
    ['+216 98 123 456', '+21698123456'],
    ['+216-98-123-456', '+21698123456'],
    ['0021671123456', '+21671123456'],
    ['98123456', '+21698123456'],
    ['  98 123 456 ', '+21698123456'],
  ])('accepts %j as %s', (input, normalized) => {
    expect(tunisianPhoneSchema.parse(input)).toBe(normalized);
  });

  it.each([
    '',
    '+2169812345', // 7 digits
    '+216981234567', // 9 digits
    '9812345',
    '+33612345678', // French number
    '+216 98 12a 456',
    '216 98 123 456', // country code without + or 00
  ])('rejects %j', (input) => {
    expect(tunisianPhoneSchema.safeParse(input).success).toBe(false);
  });
});
