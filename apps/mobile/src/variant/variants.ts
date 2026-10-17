import variants from './variants.json';

/**
 * The two apps built from this one codebase. Everything that differs between
 * the customer app and the driver app lives in `variants.json`, so the rest of
 * the code never hard-codes "user" vs "driver"; it asks the active variant.
 *
 * The data is JSON because `app.config.ts` also reads it at build time (bundle
 * ids, names) and Expo's config loader can't import other TypeScript files.
 */
export const APP_VARIANTS = ['user', 'driver'] as const;

export type AppVariant = (typeof APP_VARIANTS)[number];

export interface VariantConfig {
  variant: AppVariant;
  appName: string;
  /** iOS bundle identifier and Android application id. */
  bundleId: string;
  /** Deep-link URL scheme. */
  scheme: string;
  /** Seed color for the theme: blue for customers, amber for drivers. */
  brandColor: string;
  isDriverApp: boolean;
}

export const VARIANTS = variants as Record<AppVariant, VariantConfig>;

export function isAppVariant(value: unknown): value is AppVariant {
  return APP_VARIANTS.includes(value as AppVariant);
}
