import { z } from 'zod';

import { tunisianPhoneSchema } from './phone';

/**
 * Body of `PUT /me/customer-profile`: what a customer fills in before using
 * the customer app. The API trims and normalizes the values.
 */
export const customerProfileInputSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name').max(100, 'Name is too long'),
  phone: tunisianPhoneSchema,
});

export type CustomerProfileInput = z.input<typeof customerProfileInputSchema>;

/** A saved customer profile, as the API returns it. */
export const customerProfileSchema = z.object({
  fullName: z.string(),
  /** Normalized: `+216` followed by 8 digits. */
  phone: z.string(),
});

export type CustomerProfile = z.infer<typeof customerProfileSchema>;

/**
 * Response of `GET /me` on the API: the signed-in account, created on its
 * first call.
 *
 * One account serves both apps, so it may hold a customer profile, a driver
 * profile, both, or (right after sign-up) neither. The apps route to
 * onboarding while their profile is `null`.
 */
export const meResponseSchema = z.object({
  id: z.uuid(),
  /** Absent for sign-in methods without an email. */
  email: z.email().nullable(),
  customerProfile: customerProfileSchema.nullable(),
  // The driver profile arrives with its own slice (#8); always null until then.
  driverProfile: z.null(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
