import Constants from 'expo-constants';

import { isAppVariant, VARIANTS, type VariantConfig } from './variants';

/**
 * Picks the variant baked into the build by `app.config.ts` (`extra.appVariant`).
 * Falls back to the user app so a misconfigured dev build still starts.
 */
export function resolveVariant(extra: Record<string, unknown> | undefined): VariantConfig {
  const name = extra?.appVariant;
  return VARIANTS[isAppVariant(name) ? name : 'user'];
}

/** The active app variant. Read this instead of branching on build flags. */
export const variant: VariantConfig = resolveVariant(Constants.expoConfig?.extra);
