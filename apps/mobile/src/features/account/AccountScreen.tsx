import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useMe } from '@/api/me';
import { useSignOut } from '@/auth/useSignOut';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

/** The signed-in account, its profile, and sign-out. */
export function AccountScreen() {
  const theme = useTheme();
  const me = useMe();
  const signOut = useSignOut();
  const profile = me.data?.customerProfile;

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
          <Button kind="link" title="Edit details" onPress={() => router.push('/profile')} />
        </View>
      ) : null}
      <Button title="Sign out" onPress={() => signOut.mutate()} loading={signOut.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  card: { borderRadius: 12, padding: 16, gap: 4 },
  label: { fontSize: 13 },
  value: { fontSize: 17, fontWeight: '600' },
});
