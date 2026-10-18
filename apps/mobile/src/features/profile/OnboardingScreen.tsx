import { useSignOut } from '@/auth/useSignOut';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Button } from '@/ui/Button';

import { CustomerProfileForm } from './CustomerProfileForm';

/**
 * Shown to a signed-in customer without a profile. Once it is saved, the
 * cached account has a profile and the router moves on to the app.
 */
export function OnboardingScreen() {
  const signOut = useSignOut();
  return (
    <AuthLayout
      title="Tell us about you"
      subtitle="Drivers use your name and phone to reach you during a tow."
    >
      <CustomerProfileForm submitTitle="Continue" />
      <Button kind="link" title="Sign out" onPress={() => signOut.mutate()} />
    </AuthLayout>
  );
}
