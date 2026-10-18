import { z } from 'zod';

import { isInTunisia } from './geo';

/** A coordinate inside Tunisia. */
export const latLngSchema = z
  .object({ latitude: z.number(), longitude: z.number() })
  .refine(isInTunisia, { message: 'Location must be in Tunisia', path: ['latitude'] });

/** Body of `PUT /driver/presence`. Send the location when going online and every 15 s after. */
export const driverPresenceInputSchema = z.object({
  online: z.boolean(),
  location: latLngSchema.optional(),
});

export type DriverPresenceInput = z.input<typeof driverPresenceInputSchema>;

/** A driver's presence, as the API returns it. Dates are ISO strings. */
export const driverPresenceSchema = z.object({
  online: z.boolean(),
  location: latLngSchema.nullish(),
  locationUpdatedAt: z.iso.datetime().nullish(),
});

export type DriverPresence = z.infer<typeof driverPresenceSchema>;
