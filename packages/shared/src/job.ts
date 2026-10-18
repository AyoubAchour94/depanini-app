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
