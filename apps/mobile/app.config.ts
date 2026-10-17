import fs from 'node:fs';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

// JSON, not ./src/variant/variants.ts: Expo's config loader only transpiles this file.
import VARIANTS from './src/variant/variants.json';

/**
 * One codebase, two apps. `APP_VARIANT` (user | driver) picks the identity;
 * it is set by the package.json scripts locally and by each eas.json profile.
 */
const variantName: string = process.env.APP_VARIANT ?? 'user';
if (variantName !== 'user' && variantName !== 'driver') {
  throw new Error(`APP_VARIANT must be "user" or "driver", got "${variantName}"`);
}
const variant = VARIANTS[variantName];

/** Paste the id printed by `eas init` here (README §2). Both variants share one EAS project. */
const EAS_PROJECT_ID: string | undefined = '3937cbee-f809-4e29-9246-9471f1785c0c';

/**
 * Firebase native config for this variant. On EAS the files come from file
 * environment variables (see CI.md); locally from `firebase/<variant>/`
 * (git-ignored, see README §3). Returns undefined when absent.
 */
function firebaseFile(envVar: string, fileName: string): string | undefined {
  const candidate = process.env[envVar] ?? `./firebase/${variant.variant}/${fileName}`;
  return fs.existsSync(path.resolve(__dirname, candidate)) ? candidate : undefined;
}

const suffix = variant.variant.toUpperCase();
const googleServicesJson = firebaseFile(`GOOGLE_SERVICES_JSON_${suffix}`, 'google-services.json');
const googleServiceInfoPlist = firebaseFile(
  `GOOGLE_SERVICE_INFO_PLIST_${suffix}`,
  'GoogleService-Info.plist',
);

// The Firebase config plugins fail the native build when the config file is
// missing, so they are only applied when both files exist. Without them the
// app still builds and runs; `initFirebase()` reports "not configured".
const firebaseConfigured = Boolean(googleServicesJson && googleServiceInfoPlist);

const locationUsage =
  'Depanini needs your location to find nearby tow trucks and show your position to drivers on the way.';
const locationAlwaysUsage =
  'Depanini uses your location to match you with the closest tow truck and share live position during a rescue.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: variant.appName,
  slug: 'depanini',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: variant.scheme,
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: variant.bundleId,
    googleServicesFile: googleServiceInfoPlist,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: locationUsage,
      NSLocationAlwaysAndWhenInUseUsageDescription: locationAlwaysUsage,
    },
  },
  android: {
    package: variant.bundleId,
    googleServicesFile: googleServicesJson,
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  // Web is a development convenience for UI checks (`pnpm web:user`), not a shipped target.
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: variant.brandColor,
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    // Reads the secret RNMAPBOX_MAPS_DOWNLOAD_TOKEN from the environment at build time.
    '@rnmapbox/maps',
    ...(firebaseConfigured
      ? [
          '@react-native-firebase/app',
          '@react-native-firebase/auth',
          '@react-native-firebase/messaging',
        ]
      : []),
    // React Native Firebase uses Swift Package Manager on iOS, which needs dynamic frameworks.
    ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    appVariant: variant.variant,
    firebaseConfigured,
    eas: EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : undefined,
  },
});
