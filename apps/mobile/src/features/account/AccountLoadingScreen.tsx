import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useMe } from '@/api/me';
import { useSignOut } from '@/auth/useSignOut';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

/**
 * Shown between sign-in and the first `GET /me` answer, since the app can't
 * tell whether to onboard before then. Offers a retry if the API is unreachable.
 */
export function AccountLoadingScreen() {
  const theme = useTheme();
  const me = useMe();
  const signOut = useSignOut();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {me.isError ? (
        <>
          <Text accessibilityRole="alert" style={[styles.message, { color: theme.text }]}>
            Could not load your account from the server.
          </Text>
          <Button title="Try again" onPress={() => void me.refetch()} loading={me.isFetching} />
          <Button kind="link" title="Sign out" onPress={() => signOut.mutate()} />
        </>
      ) : (
        <ActivityIndicator accessibilityLabel="Loading your account" color={theme.brand} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  message: { fontSize: 16, textAlign: 'center' },
});
