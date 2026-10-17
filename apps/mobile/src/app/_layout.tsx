import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

import { getFirebaseStatus } from '@/firebase/firebase';
import { useTheme } from '@/theme/theme';

// Surface Firebase misconfiguration once at startup (logs a warning in dev).
getFirebaseStatus();

export default function RootLayout() {
  const theme = useTheme();
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={theme.onBrand === '#FFFFFF' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.brand },
          headerTintColor: theme.onBrand,
          contentStyle: { backgroundColor: theme.background },
        }}
      />
    </QueryClientProvider>
  );
}
