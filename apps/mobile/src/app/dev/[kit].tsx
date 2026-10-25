import { Redirect, Stack, useLocalSearchParams } from 'expo-router';

import { DriverKitScreen } from '@/features/dev/DriverKitScreen';
import { MapKitScreen } from '@/features/dev/MapKitScreen';
import { UiKitScreen } from '@/features/dev/UiKitScreen';

/**
 * `/dev/ui` previews every UI primitive, `/dev/map` the map-first shell and
 * `/dev/driver` the driver's job screens with sample data, dev builds only;
 * production builds send the visitor home. The route is
 * dynamic on purpose: Expo Router sorts static routes alphabetically and falls
 * back to the first one, so a static `dev/ui` would become the screen
 * signed-out users land on.
 */
export default function DevRoute() {
  const { kit } = useLocalSearchParams<{ kit: string }>();
  if (!__DEV__) return <Redirect href="/" />;
  if (kit === 'ui') return <UiKitScreen />;
  if (kit === 'driver') return <DriverKitScreen />;
  if (kit === 'map') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <MapKitScreen />
      </>
    );
  }
  return <Redirect href="/" />;
}
