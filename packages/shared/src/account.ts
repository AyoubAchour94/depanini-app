import { z } from 'zod';

import { tunisianPhoneSchema } from './phone';
import { verificationStatusSchema } from './verification';

const fullNameSchema = z.string().trim().min(1, 'Enter your name').max(100, 'Name is too long');

/**
 * Body of `PUT /me/customer-profile`: what a customer fills in before using
 * the customer app. The API trims and normalizes the values.
 */
export const customerProfileInputSchema = z.object({
  fullName: fullNameSchema,
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

/** The kinds of tow truck a driver can operate. Extend as the fleet grows. */
export const TRUCK_TYPES = ['flatbed', 'wheel_lift'] as const;

export const truckTypeSchema = z.enum(TRUCK_TYPES, 'Choose your truck type');

export type TruckType = z.infer<typeof truckTypeSchema>;

/**
 * Body of `PUT /me/driver-profile`: what a driver fills in before using the
 * driver app. Tunisian plate formats vary, so the plate is only trimmed and
 * upper-cased, not checked against a pattern.
 */
export const driverProfileInputSchema = z.object({
  fullName: fullNameSchema,
  phone: tunisianPhoneSchema,
  truckType: truckTypeSchema,
  plateNumber: z
    .string()
    .trim()
    .min(1, 'Enter your plate number')
    .max(20, 'Plate number is too long')
    .toUpperCase(),
});

export type DriverProfileInput = z.input<typeof driverProfileInputSchema>;

/** A saved driver profile, as the API returns it. */
export const driverProfileSchema = z.object({
  fullName: z.string(),
  /** Normalized: `+216` followed by 8 digits. */
  phone: z.string(),
  truckType: truckTypeSchema,
  /** Trimmed and upper-cased. */
  plateNumber: z.string(),
  /** The document check; missing in old payloads. */
  verificationStatus: verificationStatusSchema.nullish(),
});

export type DriverProfile = z.infer<typeof driverProfileSchema>;

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
  driverProfile: driverProfileSchema.nullable(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
