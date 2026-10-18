import { describe, expect, it } from 'vitest';

import { driverProfileInputSchema } from './account';

const valid = {
  fullName: 'Sami Trabelsi',
  phone: '+21622333444',
  truckType: 'flatbed',
  plateNumber: '123 tu 4567',
};

describe('driverProfileInputSchema', () => {
  it('trims and upper-cases the plate number', () => {
    const parsed = driverProfileInputSchema.parse({ ...valid, plateNumber: '  123 tu 4567 ' });
    expect(parsed.plateNumber).toBe('123 TU 4567');
  });

  it('accepts free-form plates', () => {
    expect(driverProfileInputSchema.parse({ ...valid, plateNumber: 'rs 98765' }).plateNumber).toBe(
      'RS 98765',
    );
  });

  it.each([
    ['an unknown truck type', { truckType: 'crane' }, 'truckType'],
    ['a blank plate', { plateNumber: '   ' }, 'plateNumber'],
    ['a non-Tunisian phone', { phone: '+33612345678' }, 'phone'],
  ])('rejects %s', (_, override, field) => {
    const result = driverProfileInputSchema.safeParse({ ...valid, ...override });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([[field]]);
  });
});
