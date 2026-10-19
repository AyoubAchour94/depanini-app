import { describe, expect, it } from 'vitest';

import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  RECEIPT_NO_PATTERN,
  completeJobInputSchema,
  disputeInputSchema,
  formatReceiptNo,
  paymentSchema,
  paymentSummarySchema,
} from './payment';

const at = '2026-10-19T10:00:00.000Z';
const payment = {
  status: 'driver_confirmed',
  method: 'cash',
  amountTnd: 85,
  receiptNo: 'DPN-2026-000123',
  driverConfirmedAt: at,
};

describe('enums', () => {
  it('lists the v1 methods and statuses', () => {
    expect(PAYMENT_METHODS).toEqual(['cash']);
    expect(PAYMENT_STATUSES).toEqual(['driver_confirmed', 'customer_confirmed', 'disputed']);
  });
});

describe('formatReceiptNo', () => {
  it.each([
    [2026, 123, 'DPN-2026-000123'],
    [2026, 1, 'DPN-2026-000001'],
    [2027, 999999, 'DPN-2027-999999'],
  ])('(%i, %i) -> %s', (year, n, expected) => {
    expect(formatReceiptNo(year, n)).toBe(expected);
    expect(RECEIPT_NO_PATTERN.test(expected)).toBe(true);
  });

  it.each([
    [2026, 0],
    [2026, -1],
    [2026, 1.5],
    [2026, 1_000_000],
    [26, 1],
    [10000, 1],
    [2026.5, 1],
  ])('rejects (%d, %d)', (year, n) => {
    expect(() => formatReceiptNo(year, n)).toThrow();
  });
});

describe('RECEIPT_NO_PATTERN', () => {
  it.each(['DPN-2026-000123', 'DPN-1999-000000'])('matches %s', (value) => {
    expect(RECEIPT_NO_PATTERN.test(value)).toBe(true);
  });

  it.each([
    'DPN-26-000123',
    'DPN-2026-12345',
    'DPN-2026-1234567',
    'dpn-2026-000123',
    ' DPN-2026-000123',
    'DPN-2026-000123\n',
    '',
  ])('rejects %j', (value) => {
    expect(RECEIPT_NO_PATTERN.test(value)).toBe(false);
  });
});

describe('paymentSchema', () => {
  it('parses a driver-confirmed payment', () => {
    expect(paymentSchema.parse(payment)).toEqual(payment);
  });

  it('parses an answered and a disputed payment', () => {
    const disputed = {
      ...payment,
      status: 'disputed',
      customerAnsweredAt: at,
      disputeNote: 'Paid 70 only',
    };
    expect(paymentSchema.parse(disputed)).toEqual(disputed);
    expect(
      paymentSchema.safeParse({
        ...payment,
        status: 'customer_confirmed',
        customerAnsweredAt: null,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['unknown status', { status: 'paid' }],
    ['unknown method', { method: 'card' }],
    ['zero amount', { amountTnd: 0 }],
    ['negative amount', { amountTnd: -5 }],
    ['fractional amount', { amountTnd: 85.5 }],
    ['bad receipt number', { receiptNo: 'DPN-2026-1' }],
    ['bad date', { driverConfirmedAt: 'yesterday' }],
    ['missing date', { driverConfirmedAt: undefined }],
  ])('rejects %s', (_name, patch) => {
    expect(paymentSchema.safeParse({ ...payment, ...patch }).success).toBe(false);
  });
});

describe('paymentSummarySchema', () => {
  it('keeps only status, amount and receipt number', () => {
    expect(paymentSummarySchema.parse(payment)).toEqual({
      status: 'driver_confirmed',
      amountTnd: 85,
      receiptNo: 'DPN-2026-000123',
    });
  });

  it('rejects a missing receipt number or unknown status', () => {
    expect(paymentSummarySchema.safeParse({ status: 'disputed', amountTnd: 85 }).success).toBe(
      false,
    );
    expect(paymentSummarySchema.safeParse({ ...payment, status: 'x' }).success).toBe(false);
  });
});

describe('completeJobInputSchema', () => {
  it('requires cashReceived to be exactly true', () => {
    expect(completeJobInputSchema.parse({ cashReceived: true })).toEqual({ cashReceived: true });
    for (const bad of [
      {},
      { cashReceived: false },
      { cashReceived: 'true' },
      { cashReceived: 1 },
    ]) {
      expect(completeJobInputSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('disputeInputSchema', () => {
  it('trims the note', () => {
    expect(disputeInputSchema.parse({ note: '  too little  ' })).toEqual({ note: 'too little' });
  });

  it('accepts 1 and 500 characters', () => {
    expect(disputeInputSchema.safeParse({ note: 'a' }).success).toBe(true);
    expect(disputeInputSchema.safeParse({ note: 'a'.repeat(500) }).success).toBe(true);
  });

  it('rejects empty, blank, too long (after trimming) and missing notes', () => {
    expect(disputeInputSchema.safeParse({ note: '' }).success).toBe(false);
    expect(disputeInputSchema.safeParse({ note: '   ' }).success).toBe(false);
    expect(disputeInputSchema.safeParse({ note: 'a'.repeat(501) }).success).toBe(false);
    expect(disputeInputSchema.safeParse({ note: ` ${'a'.repeat(501)} ` }).success).toBe(false);
    expect(disputeInputSchema.safeParse({}).success).toBe(false);
  });
});
