import { router, Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { DriverHome } from '@/features/driver/DriverHome';
import { driverStrings } from '@/features/driver/strings';
import { CustomerHome } from '@/features/request/CustomerHome';
import { useTheme } from '@/theme/theme';
import { variant } from '@/variant/variant';

export default function Home() {
  const theme = useTheme();
  // The customer home is a map screen with its own floating menu button; the
  // driver home keeps the header until its own redesign slice.
  if (!variant.isDriverApp) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <CustomerHome />
      </>
    );
  }
  return (
    <>
      <Stack.Screen
        options={{
          title: `${variant.appName} · ${driverStrings.homeTitle}`,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/account')}
              hitSlop={8}
            >
              <Text style={{ color: theme.color.onBrand, fontWeight: '600' }}>Account</Text>
            </Pressable>
          ),
        }}
      />
      <DriverHome />
    </>
  );
}
