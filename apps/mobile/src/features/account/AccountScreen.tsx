import { useMutation, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';

import { useMe } from '@/api/me';
import { signOut } from '@/auth/firebase-auth';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

/** The signed-in account and sign-out. Profiles are added here in later slices. */
export function AccountScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const me = useMe();
  const signOutMutation = useMutation({
    mutationFn: signOut,
    // Drop the previous user's cached API data.
    onSuccess: () => queryClient.clear(),
  });

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
      <Button
        title="Sign out"
        onPress={() => signOutMutation.mutate()}
        loading={signOutMutation.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  card: { borderRadius: 12, padding: 16, gap: 4 },
  label: { fontSize: 13 },
  value: { fontSize: 17, fontWeight: '600' },
});
