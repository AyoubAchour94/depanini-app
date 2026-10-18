import type { MeResponse } from '@depanini/shared';

import type { VariantConfig } from '@/variant/variants';

/**
 * Whether the account has the profile this app needs: the driver profile in
 * the driver app, the customer profile in the customer app. Without it the app
 * routes to onboarding.
 */
export function hasProfileFor(me: MeResponse, variant: VariantConfig): boolean {
  return (variant.isDriverApp ? me.driverProfile : me.customerProfile) !== null;
}
