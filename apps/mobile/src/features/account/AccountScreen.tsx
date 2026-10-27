import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useMe } from '@/api/me';
import { useSignOut } from '@/auth/useSignOut';
import { LegalSection } from '@/features/legal/LegalLinks';
import { profileFor } from '@/features/profile/onboarding';
import { describeTruck } from '@/features/profile/truck-types';
import { useRequestStrings } from '@/features/request/strings';
import { LANGUAGES, type LanguagePreference, useTranslation } from '@/i18n';
import { useLanguageSetting } from '@/i18n/language';
import { type ThemePreference, useTheme, useThemeSetting } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ChoiceField } from '@/ui/ChoiceField';
import { Text } from '@/ui/Text';
import { variant } from '@/variant/variant';

import { formatPhone } from './phone';

/** The signed-in account, this app's profile, the appearance and language settings, and sign-out. */
export function AccountScreen() {
  const { t: tr } = useTranslation();
  const requestStrings = useRequestStrings();
  const t = useTheme();
  const themeSetting = useThemeSetting();
  const languageSetting = useLanguageSetting();
  const me = useMe();
  const signOut = useSignOut();
  const profile = me.data ? profileFor(me.data, variant) : null;
  const driverProfile = variant.isDriverApp ? me.data?.driverProfile : null;
  const card = { backgroundColor: t.color.surface, borderRadius: t.radius.xl, padding: t.space[4] };

  const appearanceOptions: readonly { value: ThemePreference; label: string }[] = [
    { value: 'system', label: tr('account:appearance.system') },
    { value: 'light', label: tr('account:appearance.light') },
    { value: 'dark', label: tr('account:appearance.dark') },
  ];
  // Language names are written in their own language, so they are not translated.
  const languageOptions: readonly { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: tr('account:language.system') },
    ...LANGUAGES.map(({ code, label }) => ({ value: code, label })),
  ];

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
              {me.data
                ? (me.data.email ?? tr('account:noEmail'))
                : me.isError
                  ? tr('account:unavailable')
                  : '…'}
            </Text>
            {profile ? <Text tone="muted">{formatPhone(profile.phone)}</Text> : null}
            {driverProfile ? <Text tone="muted">{describeTruck(driverProfile)}</Text> : null}
            {me.isError ? <Text tone="danger">{tr('account:loadFailed')}</Text> : null}
          </View>
        </View>
        {profile ? (
          <Button
            kind="secondary"
            title={tr('account:editDetails')}
            onPress={() => router.push('/profile')}
          />
        ) : null}
        <View style={[card, { gap: t.space[4] }]}>
          <ChoiceField
            label={tr('account:appearance.label')}
            options={appearanceOptions}
            value={themeSetting.preference}
            onChange={themeSetting.setPreference}
          />
          <ChoiceField
            label={tr('account:language.label')}
            options={languageOptions}
            value={languageSetting.preference}
            onChange={languageSetting.setPreference}
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
            {tr('account:deleteLink')}
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
          title={tr('account:signOut')}
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
