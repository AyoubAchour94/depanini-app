import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { useMe } from '@/api/me';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { getFirebaseStatus } from '@/firebase/firebase';
import { useTheme } from '@/theme/theme';

// Surface Firebase misconfiguration once at startup (logs a warning in dev).
getFirebaseStatus();
// Keep the splash up until Firebase has restored (or ruled out) a session.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const theme = useTheme();
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style={theme.onBrand === '#FFFFFF' ? 'light' : 'dark'} />
        <RootNavigator />
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * Signed-out users can only reach the auth screens, signed-in users only the
 * app; when the session changes, the router moves to the first screen the
 * user may see. The API still checks the token on every request.
 */
function RootNavigator() {
  const theme = useTheme();
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in';
  // Fetch the account as soon as someone signs in (creates it on first sign-in).
  useMe();

  // The router needs a navigator on the first render, so the stack always
  // renders; while the session loads the splash screen hides it.
  useEffect(() => {
    if (auth.status !== 'loading') void SplashScreen.hideAsync();
  }, [auth.status]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.brand },
        headerTintColor: theme.onBrand,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="account" options={{ title: 'Account' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
      </Stack.Protected>
    </Stack>
  );
}
