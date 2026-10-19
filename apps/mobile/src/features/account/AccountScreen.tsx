import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useMe } from '@/api/me';
import { useSignOut } from '@/auth/useSignOut';
import { type ThemePreference, useTheme, useThemeSetting } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceField } from '@/ui/ChoiceField';
import { profileFor } from '@/features/profile/onboarding';
import { requestStrings } from '@/features/request/strings';
import { describeTruck } from '@/features/profile/truck-types';
import { variant } from '@/variant/variant';

const APPEARANCE_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** The signed-in account, this app's profile, the appearance setting, and sign-out. */
export function AccountScreen() {
  const theme = useTheme();
  const themeSetting = useThemeSetting();
  const me = useMe();
  const signOut = useSignOut();
  const profile = me.data ? profileFor(me.data, variant) : null;
  const driverProfile = variant.isDriverApp ? me.data?.driverProfile : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Text style={[styles.label, { color: theme.textMuted }]}>Signed in as</Text>
        <Text style={[styles.value, { color: theme.text }]}>
          {me.data ? (me.data.email ?? 'No email') : me.isError ? 'Account unavailable' : '…'}
        </Text>
        {me.isError ? (
          <Text style={{ color: theme.danger }}>Could not load your account from the server.</Text>
        ) : null}
      </View>
      {profile ? (
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.label, { color: theme.textMuted }]}>Your details</Text>
          <Text style={[styles.value, { color: theme.text }]}>{profile.fullName}</Text>
          <Text style={{ color: theme.text }}>{profile.phone}</Text>
          {driverProfile ? (
            <Text style={{ color: theme.text }}>{describeTruck(driverProfile)}</Text>
          ) : null}
          <Button kind="link" title="Edit details" onPress={() => router.push('/profile')} />
        </View>
      ) : null}
      <ChoiceField
        label="Appearance"
        options={APPEARANCE_OPTIONS}
        value={themeSetting.preference}
        onChange={themeSetting.setPreference}
      />
      {variant.isDriverApp ? null : (
        <Button
          kind="link"
          title={requestStrings.myRequests}
          onPress={() => router.push('/request/history')}
        />
      )}
      <Button title="Sign out" onPress={() => signOut.mutate()} loading={signOut.isPending} />
      <Button kind="link" title="Delete account" onPress={() => router.push('/delete-account')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  card: { borderRadius: 12, padding: 16, gap: 4 },
  label: { fontSize: 13 },
  value: { fontSize: 17, fontWeight: '600' },
});
