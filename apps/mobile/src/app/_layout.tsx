import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { useMe } from '@/api/me';
import { useRefetchVerificationWhenNotApproved } from '@/api/verification';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { env } from '@/config/env';
import { driverStrings } from '@/features/driver/strings';
import { hasProfileFor } from '@/features/profile/onboarding';
import { RequestFlowProvider } from '@/features/request/RequestFlowContext';
import { requestStrings } from '@/features/request/strings';
import { verificationStrings } from '@/features/verification/strings';
import { getFirebaseStatus } from '@/firebase/firebase';
import { configurePush } from '@/push';
import { PushProvider } from '@/push/PushProvider';
import { RealtimeProvider } from '@/realtime/RealtimeProvider';
import { useInterFonts } from '@/theme/fonts';
import { ThemeProvider, useTheme, useThemeSetting } from '@/theme/theme';
import { variant } from '@/variant/variant';

// Surface Firebase misconfiguration once at startup (logs a warning in dev).
getFirebaseStatus();
// Foreground behaviour and the Android channel; never asks for permission.
configurePush();
// Keep the splash up until Firebase has restored (or ruled out) a session.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemedStatusBar />
          <RealtimeProvider>
            <PushProvider>
              <RequestFlowProvider>
                <RootNavigator />
              </RequestFlowProvider>
            </PushProvider>
          </RealtimeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />;
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
  // A driver call refused with `driver_not_approved` brings the verification card back.
  useRefetchVerificationWhenNotApproved();
  const account = signedIn ? me.data : undefined;
  const onboarded = account ? hasProfileFor(account, variant) : false;
  const accountLoading = signedIn && me.isPending;
  const fonts = useInterFonts();
  const themeSetting = useThemeSetting();
  const assetsReady = fonts.ready && themeSetting.ready;

  // The router needs a navigator on the first render, so the stack always
  // renders; while the session, account, fonts and theme setting load the
  // splash screen hides it.
  useEffect(() => {
    if (assetsReady && auth.status !== 'loading' && !accountLoading) void SplashScreen.hideAsync();
  }, [assetsReady, auth.status, accountLoading]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.brand },
        headerTintColor: theme.onBrand,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="index" />
        <Stack.Screen name="account" options={{ title: 'Account' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
      </Stack.Protected>
      <Stack.Protected guard={onboarded && !variant.isDriverApp}>
        <Stack.Screen name="request/pickup" options={{ title: requestStrings.pickupTitle }} />
        <Stack.Screen name="request/dropoff" options={{ title: requestStrings.dropoffTitle }} />
        <Stack.Screen name="request/details" options={{ title: requestStrings.detailsTitle }} />
        <Stack.Screen name="request/fare" options={{ title: requestStrings.fareTitle }} />
        <Stack.Screen
          name="request/active"
          options={{ title: requestStrings.activeTitle, headerBackVisible: false }}
        />
        <Stack.Screen name="request/history" options={{ title: requestStrings.historyTitle }} />
        <Stack.Screen name="request/trip/[id]" options={{ title: requestStrings.tripTitle }} />
      </Stack.Protected>
      <Stack.Protected guard={onboarded && variant.isDriverApp}>
        <Stack.Screen name="job-offer/[id]" options={{ title: driverStrings.detailsTitle }} />
        <Stack.Screen
          name="job"
          options={{ title: driverStrings.jobTitle, headerBackVisible: false }}
        />
        <Stack.Screen name="jobs/index" options={{ title: driverStrings.myJobsTitle }} />
        <Stack.Screen name="jobs/[id]" options={{ title: driverStrings.jobDetailTitle }} />
        <Stack.Screen name="earnings" options={{ title: driverStrings.earningsTitle }} />
        <Stack.Screen name="verification" options={{ title: verificationStrings.title }} />
      </Stack.Protected>
      <Stack.Protected guard={onboarded && variant.isDriverApp && env.enableTestLocation}>
        <Stack.Screen name="test-location" options={{ title: driverStrings.testLocationTitle }} />
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
