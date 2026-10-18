import { useSignOut } from '@/auth/useSignOut';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Button } from '@/ui/Button';
import { variant } from '@/variant/variant';

import { CustomerProfileForm } from './CustomerProfileForm';
import { DriverProfileForm } from './DriverProfileForm';

/**
 * Shown to a signed-in account without this app's profile. Once it is saved,
 * the cached account has the profile and the router moves on to the app.
 */
export function OnboardingScreen() {
  const signOut = useSignOut();
  return variant.isDriverApp ? (
    <AuthLayout
      title="Set up your driver profile"
      subtitle="Customers see your name, phone and truck when you take their tow."
    >
      <DriverProfileForm mode="onboarding" />
      <Button kind="link" title="Sign out" onPress={() => signOut.mutate()} />
    </AuthLayout>
  ) : (
    <AuthLayout
      title="Tell us about you"
      subtitle="Drivers use your name and phone to reach you during a tow."
    >
      <CustomerProfileForm submitTitle="Continue" />
      <Button kind="link" title="Sign out" onPress={() => signOut.mutate()} />
    </AuthLayout>
  );
}
