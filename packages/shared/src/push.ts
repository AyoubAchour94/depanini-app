import { z } from 'zod';

export const devicePlatformSchema = z.enum(['ios', 'android']);

export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

/** Body of `PUT /me/devices`: the native FCM/APNs token of this install. */
export const deviceInputSchema = z.object({
  token: z.string().min(1).max(4096),
  platform: devicePlatformSchema,
  /** Which app registered: the customer app or the driver app. */
  appVariant: z.enum(['user', 'driver']),
});

export type DeviceInput = z.input<typeof deviceInputSchema>;

/** Why a push was sent. */
export const PUSH_KINDS = [
  'nearby_request',
  'offer_received',
  'offer_accepted',
  'offer_rejected',
  'offer_expired',
  'trip_stage',
  'trip_cancelled',
  'trip_completed',
  'payment_answered',
] as const;

export const pushKindSchema = z.enum(PUSH_KINDS);

export type PushKind = z.infer<typeof pushKindSchema>;

/** The data payload of a push: what the app needs to open the right screen. */
export const pushDataSchema = z.object({
  kind: pushKindSchema,
  requestId: z.uuid(),
  offerId: z.uuid().optional(),
});

export type PushData = z.infer<typeof pushDataSchema>;
