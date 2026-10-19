import { describe, expect, it } from 'vitest';

import { REPORT_CATEGORIES, REPORT_WINDOW_DAYS, reportInputSchema, reportSchema } from './report';

const id = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const requestId = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';
const createdAt = '2026-10-19T09:00:00.000Z';

describe('constants', () => {
  it('has the window and the categories', () => {
    expect(REPORT_WINDOW_DAYS).toBe(14);
    expect(REPORT_CATEGORIES).toEqual([
      'safety',
      'vehicle_damage',
      'overcharged',
      'no_show',
      'behaviour',
      'other',
    ]);
  });
});

describe('reportInputSchema', () => {
  it('trims the note', () => {
    expect(reportInputSchema.parse({ category: 'safety', note: '  Unsafe driving  ' })).toEqual({
      category: 'safety',
      note: 'Unsafe driving',
    });
  });

  it('needs a note of 1 to 1000 characters', () => {
    expect(reportInputSchema.safeParse({ category: 'other', note: '   ' }).success).toBe(false);
    expect(reportInputSchema.safeParse({ category: 'other', note: 'a'.repeat(1000) }).success).toBe(
      true,
    );
    expect(reportInputSchema.safeParse({ category: 'other', note: 'a'.repeat(1001) }).success).toBe(
      false,
    );
  });

  it('rejects an unknown category', () => {
    expect(reportInputSchema.safeParse({ category: 'spam', note: 'x' }).success).toBe(false);
  });
});

describe('reportSchema', () => {
  const report = {
    id,
    requestId,
    category: 'overcharged',
    note: 'Asked for more',
    status: 'open',
    createdAt,
  };

  it('parses an open report without a resolution', () => {
    expect(reportSchema.parse(report)).toEqual(report);
  });

  it('parses a resolved report', () => {
    const parsed = reportSchema.parse({
      ...report,
      status: 'resolved',
      resolutionNote: 'Refunded',
      resolvedAt: createdAt,
    });
    expect(parsed.resolutionNote).toBe('Refunded');
  });

  it('rejects a bad status', () => {
    expect(reportSchema.safeParse({ ...report, status: 'closed' }).success).toBe(false);
  });
});
