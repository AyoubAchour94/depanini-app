import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useMe } from '@/api/me';
import { useSignOut } from '@/auth/useSignOut';
import { LegalSection } from '@/features/legal/LegalLinks';
import { profileFor } from '@/features/profile/onboarding';
import { describeTruck } from '@/features/profile/truck-types';
import { requestStrings } from '@/features/request/strings';
import { type ThemePreference, useTheme, useThemeSetting } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ChoiceField } from '@/ui/ChoiceField';
import { Text } from '@/ui/Text';
import { variant } from '@/variant/variant';

import { formatPhone } from './phone';

const APPEARANCE_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** The signed-in account, this app's profile, the appearance setting, and sign-out. */
export function AccountScreen() {
  const t = useTheme();
  const themeSetting = useThemeSetting();
  const me = useMe();
  const signOut = useSignOut();
  const profile = me.data ? profileFor(me.data, variant) : null;
  const driverProfile = variant.isDriverApp ? me.data?.driverProfile : null;
  const card = { backgroundColor: t.color.surface, borderRadius: t.radius.xl, padding: t.space[4] };

  return (
    <View style={[styles.fill, { backgroundColor: t.color.background }]}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ padding: t.space[4], gap: t.space[4] }}
      >
        <View style={[card, styles.person, { gap: t.space[4] }]}>
          <Avatar name={profile?.fullName ?? me.data?.email ?? '?'} size={56} />
          <View style={[styles.fill, { gap: t.space[1] }]}>
            {profile ? <Text variant="heading">{profile.fullName}</Text> : null}
            <Text variant={profile ? 'body' : 'heading'} tone={profile ? 'muted' : 'text'}>
              {me.data ? (me.data.email ?? 'No email') : me.isError ? 'Account unavailable' : '…'}
            </Text>
            {profile ? <Text tone="muted">{formatPhone(profile.phone)}</Text> : null}
            {driverProfile ? <Text tone="muted">{describeTruck(driverProfile)}</Text> : null}
            {me.isError ? (
              <Text tone="danger">Could not load your account from the server.</Text>
            ) : null}
          </View>
        </View>
        {profile ? (
          <Button kind="secondary" title="Edit details" onPress={() => router.push('/profile')} />
        ) : null}
        <View style={card}>
          <ChoiceField
            label="Appearance"
            options={APPEARANCE_OPTIONS}
            value={themeSetting.preference}
            onChange={themeSetting.setPreference}
          />
        </View>
        {variant.isDriverApp ? null : (
          <Button
            kind="secondary"
            title={requestStrings.myRequests}
            onPress={() => router.push('/request/history')}
          />
        )}
        <LegalSection />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/delete-account')}
          hitSlop={8}
          style={{ paddingVertical: t.space[2] }}
        >
          <Text variant="bodyStrong" tone="danger" style={styles.center}>
            Delete account
          </Text>
        </Pressable>
      </ScrollView>
      <View
        style={{
          paddingHorizontal: t.space[4],
          paddingTop: t.space[2],
          paddingBottom: t.space[4],
        }}
      >
        <Button
          size="big"
          kind="secondary"
          title="Sign out"
          onPress={() => signOut.mutate()}
          loading={signOut.isPending}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  person: { flexDirection: 'row', alignItems: 'center' },
  center: { textAlign: 'center' },
});
