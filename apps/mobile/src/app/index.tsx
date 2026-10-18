import { router, Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { DriverHome } from '@/features/driver/DriverHome';
import { driverStrings } from '@/features/driver/strings';
import { CustomerHome } from '@/features/request/CustomerHome';
import { useTheme } from '@/theme/theme';
import { variant } from '@/variant/variant';

export default function Home() {
  const theme = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          title: variant.isDriverApp
            ? `${variant.appName} · ${driverStrings.homeTitle}`
            : variant.appName,
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
      {variant.isDriverApp ? <DriverHome /> : <CustomerHome />}
    </>
  );
}
