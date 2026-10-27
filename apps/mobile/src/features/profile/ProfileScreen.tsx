import { router } from 'expo-router';

import { useMe } from '@/api/me';
import { useTranslation } from '@/i18n';
import { variant } from '@/variant/variant';

import { CustomerProfileForm } from './CustomerProfileForm';
import { DriverProfileForm } from './DriverProfileForm';

/** Edits this app's profile; opened from the account screen. */
export function ProfileScreen() {
  const { t } = useTranslation();
  const me = useMe();
  const layout = { title: t('profile:detailsTitle') };
  // The app is only reachable with a loaded account that has this app's profile.
  return variant.isDriverApp ? (
    <DriverProfileForm
      mode="edit"
      initial={me.data?.driverProfile ?? undefined}
      onSaved={() => router.back()}
      layout={layout}
    />
  ) : (
    <CustomerProfileForm
      initial={me.data?.customerProfile ?? undefined}
      submitTitle={t('profile:save')}
      onSaved={() => router.back()}
      layout={layout}
    />
  );
}
