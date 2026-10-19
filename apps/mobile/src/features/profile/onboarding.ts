import type { CustomerProfile, DriverProfile, MeResponse } from '@depanini/shared';

import type { VariantConfig } from '@/variant/variants';

/**
 * The profile this app uses: the driver profile in the driver app, the
 * customer profile in the customer app. `null` until it is filled in.
 */
export function profileFor(
  me: MeResponse,
  variant: VariantConfig,
): CustomerProfile | DriverProfile | null {
  return variant.isDriverApp ? me.driverProfile : me.customerProfile;
}

/** Whether the account has this app's profile; without it the app routes to onboarding. */
export function hasProfileFor(me: MeResponse, variant: VariantConfig): boolean {
  return profileFor(me, variant) !== null;
}

let driverOnboardingDone = false;

/**
 * Remembers that the driver just saved their profile for the first time, so the driver home
 * opens the verification screen once (the router is already moving to the home by then).
 */
export function markDriverOnboardingDone() {
  driverOnboardingDone = true;
}

/** True once after {@link markDriverOnboardingDone}. */
export function consumeDriverOnboardingDone(): boolean {
  const done = driverOnboardingDone;
  driverOnboardingDone = false;
  return done;
}
