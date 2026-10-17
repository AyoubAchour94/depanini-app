import { router, Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { MapScreen } from '@/features/map/MapScreen';
import { useTheme } from '@/theme/theme';
import { variant } from '@/variant/variant';

export default function Home() {
  const theme = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          title: `${variant.appName} · Map test (Tunis)`,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/account')}
              hitSlop={8}
            >
              <Text style={{ color: theme.onBrand, fontWeight: '600' }}>Account</Text>
            </Pressable>
          ),
        }}
      />
      <MapScreen />
    </>
  );
}
