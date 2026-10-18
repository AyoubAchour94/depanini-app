import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { hasProfileFor, useMe } from '@/api/me';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { getFirebaseStatus } from '@/firebase/firebase';
import { useTheme } from '@/theme/theme';
import { variant } from '@/variant/variant';

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
 * Signed-out users can only reach the auth screens. Signed-in users wait for
 * their account, then see onboarding until this app's profile exists, then
 * the app. When any of that changes, the router moves to the first screen the
 * user may see. The API still checks the token on every request.
 */
function RootNavigator() {
  const theme = useTheme();
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in';
  // Fetch the account as soon as someone signs in (creates it on first sign-in).
  const me = useMe();
  const account = signedIn ? me.data : undefined;
  const onboarded = account ? hasProfileFor(account, variant) : false;
  const accountLoading = signedIn && me.isPending;

  // The router needs a navigator on the first render, so the stack always
  // renders; while the session and account load the splash screen hides it.
  useEffect(() => {
    if (auth.status !== 'loading' && !accountLoading) void SplashScreen.hideAsync();
  }, [auth.status, accountLoading]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.brand },
        headerTintColor: theme.onBrand,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Protected guard={Boolean(account) && onboarded}>
        <Stack.Screen name="index" />
        <Stack.Screen name="account" options={{ title: 'Account' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(account) && !onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !account}>
        <Stack.Screen name="loading-account" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
      </Stack.Protected>
    </Stack>
  );
}
