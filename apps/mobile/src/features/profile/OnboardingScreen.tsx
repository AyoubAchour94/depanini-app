import { useSignOut } from '@/auth/useSignOut';
import { useTranslation } from '@/i18n';
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
  const { t } = useTranslation();
  const signOut = useSignOut();
  const signOutLink = (
    <Button kind="link" title={t('account:signOut')} onPress={() => signOut.mutate()} />
  );
  return variant.isDriverApp ? (
    <DriverProfileForm
      mode="onboarding"
      onSaved={markDriverOnboardingDone}
      layout={{
        bare: true,
        title: t('profile:driverSetupTitle'),
        subtitle: t('profile:driverSetupSubtitle'),
      }}
      footer={signOutLink}
    />
  ) : (
    <CustomerProfileForm
      submitTitle={t('profile:continue')}
      layout={{
        bare: true,
        title: t('profile:customerSetupTitle'),
        subtitle: t('profile:customerSetupSubtitle'),
      }}
      footer={signOutLink}
    />
  );
}
