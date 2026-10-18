import { router } from 'expo-router';

import { useMe } from '@/api/me';
import { AuthLayout } from '@/features/auth/AuthLayout';

import { CustomerProfileForm } from './CustomerProfileForm';

/** Edits the customer profile; opened from the account screen. */
export function ProfileScreen() {
  const me = useMe();
  // The app is only reachable with a loaded account that has a profile.
  const profile = me.data?.customerProfile ?? undefined;
  return (
    <AuthLayout title="Your details">
      <CustomerProfileForm initial={profile} submitTitle="Save" onSaved={() => router.back()} />
    </AuthLayout>
  );
}
