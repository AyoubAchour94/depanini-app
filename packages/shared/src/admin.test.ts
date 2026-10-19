import { describe, expect, it } from 'vitest';

import {
  adminDisputePageSchema,
  adminDriverDetailSchema,
  adminDriverPageSchema,
  adminReportPageSchema,
  adminTripDetailSchema,
  adminUserDetailSchema,
  adminUserPageSchema,
  auditPageSchema,
  resolveInputSchema,
  reviewInputSchema,
} from './admin';

const id = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const other = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';
const at = '2026-10-19T09:00:00.000Z';
const place = { latitude: 36.8, longitude: 10.18, address: 'Tunis' };

const driverItem = {
  userId: id,
  fullName: 'Ali',
  phone: '+21620123456',
  truckType: 'flatbed',
  plateNumber: '123TUN4567',
  verificationStatus: 'pending',
};

describe('reviewInputSchema', () => {
  it('accepts an approval', () => {
    expect(reviewInputSchema.parse({ decision: 'approve' })).toEqual({ decision: 'approve' });
  });

  it('needs a trimmed reason of 1 to 500 characters to reject', () => {
    expect(reviewInputSchema.parse({ decision: 'reject', reason: ' Blurry ' })).toEqual({
      decision: 'reject',
      reason: 'Blurry',
    });
    expect(reviewInputSchema.safeParse({ decision: 'reject' }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ decision: 'reject', reason: '  ' }).success).toBe(false);
    expect(
      reviewInputSchema.safeParse({ decision: 'reject', reason: 'a'.repeat(500) }).success,
    ).toBe(true);
    expect(
      reviewInputSchema.safeParse({ decision: 'reject', reason: 'a'.repeat(501) }).success,
    ).toBe(false);
    expect(reviewInputSchema.safeParse({ decision: 'maybe' }).success).toBe(false);
  });
});

describe('resolveInputSchema', () => {
  it('needs a trimmed note of 1 to 1000 characters', () => {
    expect(resolveInputSchema.parse({ note: ' Refunded ' })).toEqual({ note: 'Refunded' });
    expect(resolveInputSchema.safeParse({ note: ' ' }).success).toBe(false);
    expect(resolveInputSchema.safeParse({ note: 'a'.repeat(1001) }).success).toBe(false);
  });
});

describe('driver schemas', () => {
  it('parses a page with and without a next cursor', () => {
    expect(
      adminDriverPageSchema.parse({ items: [driverItem], nextCursor: null }).items,
    ).toHaveLength(1);
    expect(adminDriverPageSchema.parse({ items: [], nextCursor: 'abc' }).nextCursor).toBe('abc');
    expect(adminDriverPageSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it('parses a detail with documents', () => {
    const parsed = adminDriverDetailSchema.parse({
      ...driverItem,
      email: 'ali@example.com',
      submittedAt: at,
      documents: [
        {
          id: other,
          kind: 'licence',
          page: 1,
          contentType: 'image/png',
          sizeBytes: 10,
          createdAt: at,
        },
      ],
    });
    expect(parsed.documents[0]?.kind).toBe('licence');
  });
});

describe('user schemas', () => {
  const summary = { id, email: 'a@example.com', phone: '+21620123456', createdAt: at };

  it('parses a page of summaries, with sparse fields', () => {
    expect(
      adminUserPageSchema.parse({ items: [summary, { id, createdAt: at }], nextCursor: null }),
    );
  });

  it('parses a detail with counts and recent trips', () => {
    const parsed = adminUserDetailSchema.parse({
      ...summary,
      customerProfile: { fullName: 'Sami', phone: '+21620123456' },
      counts: { tripsAsCustomer: 2, tripsAsDriver: 0, reportsMade: 1, reportsAgainst: 0 },
      recentTrips: [
        {
          id: other,
          status: 'completed',
          pickupAddress: 'A',
          dropoffAddress: 'B',
          agreedFare: 40,
          createdAt: at,
        },
      ],
    });
    expect(parsed.recentTrips).toHaveLength(1);
  });
});

describe('adminTripDetailSchema', () => {
  const trip = {
    id,
    status: 'completed',
    pickupAddress: 'A',
    dropoffAddress: 'B',
    createdAt: at,
    problemType: 'breakdown',
    vehicleType: 'car',
    pickup: place,
    dropoff: place,
    distanceM: 5000,
    suggestedFare: 40,
    proposedFare: 40,
    offers: [],
    reports: [],
  };

  it('parses a bare open trip', () => {
    expect(adminTripDetailSchema.parse(trip).payment).toBeUndefined();
  });

  it('parses a completed trip with payment, dispute, ratings with comments and reports', () => {
    const parsed = adminTripDetailSchema.parse({
      ...trip,
      agreedFare: 45,
      assignedAt: at,
      completedAt: at,
      offers: [{ id: other, driverName: 'Ali', fare: 45, status: 'accepted', createdAt: at }],
      payment: {
        status: 'disputed',
        method: 'cash',
        amountTnd: 45,
        receiptNo: 'DPN-2026-000123',
        driverConfirmedAt: at,
        customerAnsweredAt: at,
        disputeNote: 'Paid less',
        resolutionNote: 'Checked with both',
        resolvedAt: at,
      },
      customerRating: { stars: 2, tags: ['late'], comment: 'Late by an hour', createdAt: at },
      driverRating: { stars: 5, tags: [], createdAt: at },
      reports: [
        {
          id: other,
          requestId: id,
          category: 'no_show',
          note: 'x',
          status: 'open',
          createdAt: at,
          reporterUserId: id,
          reporterRole: 'driver',
        },
      ],
    });
    expect(parsed.payment?.disputeNote).toBe('Paid less');
    expect(parsed.payment?.resolutionNote).toBe('Checked with both');
    expect(parsed.customerRating?.comment).toBe('Late by an hour');
    expect(parsed.driverRating?.comment).toBeUndefined();
    expect(parsed.reports[0]?.reporterRole).toBe('driver');
  });
});

describe('queue and audit pages', () => {
  it('parses report and dispute queue items', () => {
    expect(
      adminReportPageSchema.parse({
        items: [
          {
            id: other,
            requestId: id,
            category: 'safety',
            note: 'x',
            status: 'resolved',
            resolutionNote: 'ok',
            createdAt: at,
            resolvedAt: at,
            reporterUserId: id,
            reporterRole: 'customer',
            pickupAddress: 'A',
          },
        ],
        nextCursor: null,
      }).items,
    ).toHaveLength(1);
    expect(
      adminDisputePageSchema.parse({
        items: [
          {
            requestId: id,
            receiptNo: 'DPN-2026-000123',
            amountTnd: 45,
            disputeNote: 'x',
            status: 'open',
          },
        ],
        nextCursor: null,
      }).items,
    ).toHaveLength(1);
  });

  it('parses audit entries and rejects unknown actions', () => {
    const entry = {
      id,
      adminUserId: other,
      action: 'driver_rejected',
      targetType: 'driver',
      targetId: id,
      details: { reason: 'Blurry' },
      createdAt: at,
    };
    expect(auditPageSchema.parse({ items: [entry], nextCursor: null }).items[0]?.details).toEqual({
      reason: 'Blurry',
    });
    expect(
      auditPageSchema.safeParse({ items: [{ ...entry, action: 'deleted_db' }], nextCursor: null })
        .success,
    ).toBe(false);
  });
});
