import { z } from 'zod';

import { towRequestSchema } from './tow-request';

/** An assigned request, as its driver sees it: the request plus the customer's contact. */
export const driverJobSchema = towRequestSchema.extend({
  status: z.literal('assigned'),
  agreedFare: z.number().int().positive(),
  assignedAt: z.iso.datetime(),
  customer: z.object({
    fullName: z.string(),
    phone: z.string(),
  }),
});

export type DriverJob = z.infer<typeof driverJobSchema>;
