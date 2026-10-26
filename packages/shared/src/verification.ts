import { z } from 'zod';

/** Where a driver stands with the document check. Only `approved` drivers can go online. */
export const VERIFICATION_STATUSES = ['unsubmitted', 'pending', 'approved', 'rejected'] as const;

export const verificationStatusSchema = z.enum(VERIFICATION_STATUSES);

export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

/** The documents a driver must upload: licence, carte grise, insurance and CIN. */
export const DOCUMENT_KINDS = ['licence', 'registration', 'insurance', 'national_id'] as const;

export const documentKindSchema = z.enum(DOCUMENT_KINDS);

export type DocumentKind = z.infer<typeof documentKindSchema>;

/** Largest upload, in bytes. */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** The file types an upload may have. */
export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

export const uploadContentTypeSchema = z.enum(UPLOAD_CONTENT_TYPES);

export type UploadContentType = z.infer<typeof uploadContentTypeSchema>;

/** Error code of the `403` returned when an unapproved driver tries to go online or work. */
export const DRIVER_NOT_APPROVED = 'driver_not_approved';

/**
 * Error code of the `429` answered when a driver has uploaded too many document pages in
 * the last hour or day (the API's `UPLOAD_LIMIT_PER_HOUR` / `UPLOAD_LIMIT_PER_DAY`).
 */
export const UPLOAD_LIMIT_REACHED = 'upload_limit_reached';

/** One uploaded page of a document, as the API returns it. Dates are ISO strings. */
export const driverDocumentSchema = z.object({
  id: z.uuid(),
  kind: documentKindSchema,
  /** 1-based page number within the document. */
  page: z.number().int().positive(),
  contentType: uploadContentTypeSchema,
  sizeBytes: z.number().int().positive().max(UPLOAD_MAX_BYTES),
  createdAt: z.iso.datetime(),
});

export type DriverDocument = z.infer<typeof driverDocumentSchema>;

/** Response of `GET /driver/verification`: the driver's own check. */
export const verificationSchema = z.object({
  status: verificationStatusSchema,
  /** Why the last submission was rejected; set while `rejected`. */
  rejectionReason: z.string().nullish(),
  submittedAt: z.iso.datetime().nullish(),
  reviewedAt: z.iso.datetime().nullish(),
  documents: z.array(driverDocumentSchema),
  /** Required kinds with no page uploaded yet. */
  missingKinds: z.array(documentKindSchema),
});

export type Verification = z.infer<typeof verificationSchema>;
