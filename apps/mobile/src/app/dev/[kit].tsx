import { Redirect, useLocalSearchParams } from 'expo-router';

import { UiKitScreen } from '@/features/dev/UiKitScreen';

/**
 * `/dev/ui`: a preview of every UI primitive, dev builds only; production
 * builds send the visitor home. The route is dynamic on purpose: Expo Router
 * sorts static routes alphabetically and falls back to the first one, so a
 * static `dev/ui` would become the screen signed-out users land on.
 */
export default function DevRoute() {
  const { kit } = useLocalSearchParams<{ kit: string }>();
  return __DEV__ && kit === 'ui' ? <UiKitScreen /> : <Redirect href="/" />;
}
