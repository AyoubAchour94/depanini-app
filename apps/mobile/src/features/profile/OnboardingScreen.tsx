import { useSignOut } from '@/auth/useSignOut';
import { Button } from '@/ui/Button';
import { variant } from '@/variant/variant';

import { CustomerProfileForm } from './CustomerProfileForm';
import { DriverProfileForm } from './DriverProfileForm';
import { markDriverOnboardingDone } from './onboarding';

/**
 * Shown to a signed-in account without this app's profile. Once it is saved,
 * the cached account has the profile and the router moves on to the app.
 */
export function OnboardingScreen() {
  const signOut = useSignOut();
  const signOutLink = <Button kind="link" title="Sign out" onPress={() => signOut.mutate()} />;
  return variant.isDriverApp ? (
    <DriverProfileForm
      mode="onboarding"
      onSaved={markDriverOnboardingDone}
      layout={{
        bare: true,
        title: 'Set up your driver profile',
        subtitle: 'Customers see your name, phone and truck when you take their tow.',
      }}
      footer={signOutLink}
    />
  ) : (
    <CustomerProfileForm
      submitTitle="Continue"
      layout={{
        bare: true,
        title: 'Tell us about you',
        subtitle: 'Drivers use your name and phone to reach you during a tow.',
      }}
      footer={signOutLink}
    />
  );
}
