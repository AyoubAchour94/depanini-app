import { describe, expect, it } from 'vitest';

import { driverProfileSchema } from './account';
import {
  DOCUMENT_KINDS,
  driverDocumentSchema,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_MAX_BYTES,
  VERIFICATION_STATUSES,
  verificationSchema,
} from './verification';

const id = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const createdAt = '2026-10-19T09:00:00.000Z';

const document = {
  id,
  kind: 'licence',
  page: 1,
  contentType: 'image/jpeg',
  sizeBytes: 1234,
  createdAt,
};

describe('constants', () => {
  it('lists the four required documents and three file types', () => {
    expect(DOCUMENT_KINDS).toEqual(['licence', 'registration', 'insurance', 'national_id']);
    expect(UPLOAD_CONTENT_TYPES).toEqual(['image/jpeg', 'image/png', 'application/pdf']);
    expect(UPLOAD_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(VERIFICATION_STATUSES).toEqual(['unsubmitted', 'pending', 'approved', 'rejected']);
  });
});

describe('driverDocumentSchema', () => {
  it('accepts a page', () => {
    expect(driverDocumentSchema.parse(document)).toEqual(document);
  });

  it('rejects a bad kind, type, page or size', () => {
    expect(driverDocumentSchema.safeParse({ ...document, kind: 'passport' }).success).toBe(false);
    expect(driverDocumentSchema.safeParse({ ...document, contentType: 'image/gif' }).success).toBe(
      false,
    );
    expect(driverDocumentSchema.safeParse({ ...document, page: 0 }).success).toBe(false);
    expect(
      driverDocumentSchema.safeParse({ ...document, sizeBytes: UPLOAD_MAX_BYTES }).success,
    ).toBe(true);
    expect(
      driverDocumentSchema.safeParse({ ...document, sizeBytes: UPLOAD_MAX_BYTES + 1 }).success,
    ).toBe(false);
  });
});

describe('verificationSchema', () => {
  it('accepts an unsubmitted check with every kind missing', () => {
    const parsed = verificationSchema.parse({
      status: 'unsubmitted',
      documents: [],
      missingKinds: [...DOCUMENT_KINDS],
    });
    expect(parsed.missingKinds).toHaveLength(4);
  });

  it('accepts a rejected check with its reason', () => {
    const parsed = verificationSchema.parse({
      status: 'rejected',
      rejectionReason: 'Photo is blurry',
      submittedAt: createdAt,
      reviewedAt: createdAt,
      documents: [document],
      missingKinds: [],
    });
    expect(parsed.rejectionReason).toBe('Photo is blurry');
  });

  it('rejects an unknown status', () => {
    expect(
      verificationSchema.safeParse({ status: 'maybe', documents: [], missingKinds: [] }).success,
    ).toBe(false);
  });
});

describe('driverProfileSchema backwards compatibility', () => {
  const profile = {
    fullName: 'Ali',
    phone: '+21620123456',
    truckType: 'flatbed',
    plateNumber: '123TUN4567',
  };

  it('parses an old payload without a verification status', () => {
    expect(driverProfileSchema.parse(profile).verificationStatus).toBeUndefined();
  });

  it('parses a new payload with one', () => {
    const parsed = driverProfileSchema.parse({ ...profile, verificationStatus: 'approved' });
    expect(parsed.verificationStatus).toBe('approved');
    expect(driverProfileSchema.parse({ ...profile, verificationStatus: null })).toBeTruthy();
    expect(driverProfileSchema.safeParse({ ...profile, verificationStatus: 'x' }).success).toBe(
      false,
    );
  });
});
