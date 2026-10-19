import { z } from 'zod';

import { towRequestSchema, tripStageSchema } from './tow-request';

/** An assigned request, as its driver sees it: the request plus the customer's contact. */
export const driverJobSchema = towRequestSchema.extend({
  status: z.literal('assigned'),
  agreedFare: z.number().int().positive(),
  assignedAt: z.iso.datetime(),
  /** Null for jobs assigned before trips existed. The stage timestamps come from the request. */
  tripStage: tripStageSchema.nullish(),
  customer: z.object({
    fullName: z.string(),
    phone: z.string(),
  }),
});

export type DriverJob = z.infer<typeof driverJobSchema>;

/** Response of `GET /driver/jobs`: a page of completed and cancelled jobs, newest first. */
export const driverJobsPageSchema = z.object({
  items: z.array(towRequestSchema),
  /** Pass back to get the next page; `null` on the last one. */
  nextCursor: z.string().nullable(),
});

export type DriverJobsPage = z.infer<typeof driverJobsPageSchema>;

/** Completed trips and their agreed fares over one period. */
export const earningsPeriodSchema = z.object({
  trips: z.number().int().nonnegative(),
  /** Whole dinars. */
  totalTnd: z.number().int().nonnegative(),
});

export type EarningsPeriod = z.infer<typeof earningsPeriodSchema>;

/** Response of `GET /driver/earnings`; the periods are in the Africa/Tunis time zone. */
export const earningsSchema = z.object({
  today: earningsPeriodSchema,
  week: earningsPeriodSchema,
  month: earningsPeriodSchema,
});

export type Earnings = z.infer<typeof earningsSchema>;
