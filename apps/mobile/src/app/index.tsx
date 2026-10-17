import { Stack } from 'expo-router';

import { MapScreen } from '@/features/map/MapScreen';
import { variant } from '@/variant/variant';

export default function Home() {
  return (
    <>
      <Stack.Screen options={{ title: `${variant.appName} · Map test (Tunis)` }} />
      <MapScreen />
    </>
  );
}
