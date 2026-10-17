import { z } from 'zod';

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
  // Profiles arrive with their own slices (#7, #8); always null until then.
  customerProfile: z.null(),
  driverProfile: z.null(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
