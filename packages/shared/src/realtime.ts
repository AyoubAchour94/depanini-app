import { z } from 'zod';

import { driverJobSchema } from './job';
import { customerOfferSchema, offerSchema } from './offer';
import { latLngSchema } from './presence';
import { towRequestSchema } from './tow-request';

/** Sent by the client as the first message after the `/ws` socket opens. */
export const wsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().min(1) }),
]);

export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;

/** Pushed by the API on `/ws` to the people involved in a request. */
export const wsServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth.ok') }),
  /** A hint, not data: the open requests near this driver changed, so refetch the nearby list. */
  z.object({ type: z.literal('nearby.changed') }),
  z.object({ type: z.literal('auth.error'), message: z.string().nullish() }),
  z.object({
    type: z.literal('request.updated'),
    /** The assigned driver gets the job, with the customer's contact. */
    request: driverJobSchema.or(towRequestSchema),
  }),
  z.object({
    type: z.literal('offer.updated'),
    /** The customer gets the offer with its driver. */
    offer: customerOfferSchema.or(offerSchema),
  }),
  z.object({
    type: z.literal('driver.location'),
    requestId: z.uuid(),
    location: latLngSchema,
    etaMin: z.number().int().positive(),
  }),
]);

export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;
