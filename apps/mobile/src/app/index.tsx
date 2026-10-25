import { Stack } from 'expo-router';

import { DriverHome } from '@/features/driver/DriverHome';
import { CustomerHome } from '@/features/request/CustomerHome';
import { variant } from '@/variant/variant';

export default function Home() {
  // Both homes are map screens with their own floating menu button.
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {variant.isDriverApp ? <DriverHome /> : <CustomerHome />}
    </>
  );
}
