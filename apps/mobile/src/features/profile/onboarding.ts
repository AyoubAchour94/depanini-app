import type { MeResponse } from '@depanini/shared';

import type { VariantConfig } from '@/variant/variants';

/**
 * Whether the account has the profile this app needs; without it the app
 * routes to onboarding. The driver profile arrives with #8, so until then the
 * driver app never onboards.
 */
export function hasProfileFor(me: MeResponse, variant: VariantConfig): boolean {
  return variant.isDriverApp || me.customerProfile !== null;
}
