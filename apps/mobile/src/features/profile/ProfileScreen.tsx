import { router } from 'expo-router';

import { useMe } from '@/api/me';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { variant } from '@/variant/variant';

import { CustomerProfileForm } from './CustomerProfileForm';
import { DriverProfileForm } from './DriverProfileForm';

/** Edits this app's profile; opened from the account screen. */
export function ProfileScreen() {
  const me = useMe();
  // The app is only reachable with a loaded account that has this app's profile.
  return (
    <AuthLayout title="Your details">
      {variant.isDriverApp ? (
        <DriverProfileForm
          mode="edit"
          initial={me.data?.driverProfile ?? undefined}
          onSaved={() => router.back()}
        />
      ) : (
        <CustomerProfileForm
          initial={me.data?.customerProfile ?? undefined}
          submitTitle="Save"
          onSaved={() => router.back()}
        />
      )}
    </AuthLayout>
  );
}
