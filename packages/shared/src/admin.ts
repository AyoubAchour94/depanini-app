import { z } from 'zod';

import { truckTypeSchema } from './account';
import { offerStatusSchema } from './offer';
import { paymentSchema } from './payment';
import { reportSchema } from './report';
import {
  cancelledBySchema,
  placeSchema,
  problemTypeSchema,
  towRequestStatusSchema,
  tripStageSchema,
  vehicleTypeSchema,
} from './tow-request';
import { driverDocumentSchema, verificationStatusSchema } from './verification';

/** Wraps an item schema in the cursor page the admin lists return. */
function adminPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    /** Pass back to get the next page; `null` on the last one. */
    nextCursor: z.string().nullable(),
  });
}

/** Longest rejection reason, in characters. */
export const MAX_REJECTION_REASON_LENGTH = 500;

/** Longest resolution note, in characters. */
export const MAX_RESOLUTION_NOTE_LENGTH = 1000;

/** Body of `POST /admin/drivers/:userId/review`. */
export const reviewInputSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve') }),
  z.object({
    decision: z.literal('reject'),
    reason: z
      .string()
      .trim()
      .min(1, 'Give a reason')
      .max(MAX_REJECTION_REASON_LENGTH, 'Reason is too long'),
  }),
]);

export type ReviewInput = z.input<typeof reviewInputSchema>;

/** Body of `POST /admin/reports/:id/resolve` and `POST /admin/disputes/:requestId/resolve`. */
export const resolveInputSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, 'Write a note')
    .max(MAX_RESOLUTION_NOTE_LENGTH, 'Note is too long'),
});

export type ResolveInput = z.input<typeof resolveInputSchema>;

/** A row of the driver queue or list. Dates are ISO strings. */
export const adminDriverItemSchema = z.object({
  userId: z.uuid(),
  fullName: z.string(),
  email: z.email().nullish(),
  phone: z.string(),
  truckType: truckTypeSchema,
  plateNumber: z.string(),
  verificationStatus: verificationStatusSchema,
  submittedAt: z.iso.datetime().nullish(),
});

export type AdminDriverItem = z.infer<typeof adminDriverItemSchema>;

export const adminDriverPageSchema = adminPageSchema(adminDriverItemSchema);

export type AdminDriverPage = z.infer<typeof adminDriverPageSchema>;

/** Response of `GET /admin/drivers/:userId`: the profile, the check and its documents. */
export const adminDriverDetailSchema = adminDriverItemSchema.extend({
  rejectionReason: z.string().nullish(),
  reviewedAt: z.iso.datetime().nullish(),
  reviewedBy: z.uuid().nullish(),
  documents: z.array(driverDocumentSchema),
});

export type AdminDriverDetail = z.infer<typeof adminDriverDetailSchema>;

/** A row of the user search. */
export const adminUserSummarySchema = z.object({
  id: z.uuid(),
  email: z.email().nullish(),
  /** The phone of the customer or driver profile, if any. */
  phone: z.string().nullish(),
  customerName: z.string().nullish(),
  driverName: z.string().nullish(),
  createdAt: z.iso.datetime(),
});

export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUserPageSchema = adminPageSchema(adminUserSummarySchema);

export type AdminUserPage = z.infer<typeof adminUserPageSchema>;

/** A row of the trip search. */
export const adminTripItemSchema = z.object({
  id: z.uuid(),
  status: towRequestStatusSchema,
  customerName: z.string().nullish(),
  driverName: z.string().nullish(),
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  agreedFare: z.number().int().positive().nullish(),
  createdAt: z.iso.datetime(),
});

export type AdminTripItem = z.infer<typeof adminTripItemSchema>;

export const adminTripPageSchema = adminPageSchema(adminTripItemSchema);

export type AdminTripPage = z.infer<typeof adminTripPageSchema>;

/** Response of `GET /admin/users/:id`: the account, its profiles, counts and recent trips. */
export const adminUserDetailSchema = adminUserSummarySchema.extend({
  customerProfile: z.object({ fullName: z.string(), phone: z.string() }).nullish(),
  driverProfile: z
    .object({
      fullName: z.string(),
      phone: z.string(),
      truckType: truckTypeSchema,
      plateNumber: z.string(),
      verificationStatus: verificationStatusSchema,
    })
    .nullish(),
  counts: z.object({
    tripsAsCustomer: z.number().int().nonnegative(),
    tripsAsDriver: z.number().int().nonnegative(),
    reportsMade: z.number().int().nonnegative(),
    reportsAgainst: z.number().int().nonnegative(),
  }),
  recentTrips: z.array(adminTripItemSchema),
});

export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

/** A rating as support sees it: stars, tags and the private comment. */
export const adminRatingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  tags: z.array(z.string()),
  comment: z.string().nullish(),
  createdAt: z.iso.datetime(),
});

export type AdminRating = z.infer<typeof adminRatingSchema>;

/** A report on a trip, with who made it. */
export const adminReportSchema = reportSchema.extend({
  reporterUserId: z.uuid(),
  reporterRole: z.enum(['customer', 'driver']),
  reporterName: z.string().nullish(),
  resolvedBy: z.uuid().nullish(),
});

export type AdminReport = z.infer<typeof adminReportSchema>;

/** Response of `GET /admin/trips/:id`: everything support needs about one trip. */
export const adminTripDetailSchema = adminTripItemSchema.extend({
  problemType: problemTypeSchema,
  vehicleType: vehicleTypeSchema,
  note: z.string().nullish(),
  pickup: placeSchema,
  dropoff: placeSchema,
  distanceM: z.number().int().nonnegative(),
  suggestedFare: z.number().int().positive(),
  proposedFare: z.number().int().positive(),
  tripStage: tripStageSchema.nullish(),
  customer: z
    .object({ userId: z.uuid(), fullName: z.string(), phone: z.string().nullish() })
    .nullish(),
  driver: z
    .object({
      userId: z.uuid(),
      fullName: z.string(),
      phone: z.string().nullish(),
      plateNumber: z.string().nullish(),
    })
    .nullish(),
  /** Timeline: stage times, null or absent when not reached. */
  assignedAt: z.iso.datetime().nullish(),
  enRouteAt: z.iso.datetime().nullish(),
  arrivedAt: z.iso.datetime().nullish(),
  towingAt: z.iso.datetime().nullish(),
  completedAt: z.iso.datetime().nullish(),
  cancelledAt: z.iso.datetime().nullish(),
  cancelledBy: cancelledBySchema.nullish(),
  cancelReason: z.string().nullish(),
  offers: z.array(
    z.object({
      id: z.uuid(),
      driverName: z.string(),
      fare: z.number().int().positive(),
      status: offerStatusSchema,
      createdAt: z.iso.datetime(),
    }),
  ),
  /** The payment, with the dispute note and how support resolved it. */
  payment: paymentSchema
    .extend({
      resolutionNote: z.string().nullish(),
      resolvedAt: z.iso.datetime().nullish(),
    })
    .nullish(),
  /** The customer's rating of the driver. */
  customerRating: adminRatingSchema.nullish(),
  /** The driver's rating of the customer. */
  driverRating: adminRatingSchema.nullish(),
  reports: z.array(adminReportSchema),
});

export type AdminTripDetail = z.infer<typeof adminTripDetailSchema>;

/** A row of the reports queue. */
export const adminReportItemSchema = adminReportSchema.extend({
  pickupAddress: z.string().nullish(),
});

export type AdminReportItem = z.infer<typeof adminReportItemSchema>;

export const adminReportPageSchema = adminPageSchema(adminReportItemSchema);

export type AdminReportPage = z.infer<typeof adminReportPageSchema>;

/** A row of the payment disputes queue. */
export const adminDisputeItemSchema = z.object({
  requestId: z.uuid(),
  receiptNo: z.string(),
  amountTnd: z.number().int().positive(),
  disputeNote: z.string().nullish(),
  customerName: z.string().nullish(),
  driverName: z.string().nullish(),
  /** Open until support writes a resolution note. */
  status: z.enum(['open', 'resolved']),
  resolutionNote: z.string().nullish(),
  disputedAt: z.iso.datetime().nullish(),
  resolvedAt: z.iso.datetime().nullish(),
});

export type AdminDisputeItem = z.infer<typeof adminDisputeItemSchema>;

export const adminDisputePageSchema = adminPageSchema(adminDisputeItemSchema);

export type AdminDisputePage = z.infer<typeof adminDisputePageSchema>;

/** What an admin did, for the audit log. */
export const ADMIN_ACTIONS = [
  'driver_approved',
  'driver_rejected',
  'report_resolved',
  'dispute_resolved',
] as const;

export const adminActionSchema = z.enum(ADMIN_ACTIONS);

export type AdminAction = z.infer<typeof adminActionSchema>;

/** A row of `GET /admin/audit`. */
export const auditEntrySchema = z.object({
  id: z.uuid(),
  adminUserId: z.uuid(),
  adminEmail: z.email().nullish(),
  action: adminActionSchema,
  targetType: z.enum(['driver', 'report', 'dispute']),
  targetId: z.string(),
  details: z.record(z.string(), z.unknown()).nullish(),
  createdAt: z.iso.datetime(),
});

export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditPageSchema = adminPageSchema(auditEntrySchema);

export type AuditPage = z.infer<typeof auditPageSchema>;
