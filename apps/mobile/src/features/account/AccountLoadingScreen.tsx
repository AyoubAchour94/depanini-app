import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useMe } from '@/api/me';
import { useSignOut } from '@/auth/useSignOut';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';

/**
 * Shown between sign-in and the first `GET /me` answer, since the app can't
 * tell whether to onboard before then. Offers a retry if the API is unreachable.
 */
export function AccountLoadingScreen() {
  const { t: tr } = useTranslation();
  const t = useTheme();
  const me = useMe();
  const signOut = useSignOut();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: t.color.background, padding: t.space[6], gap: t.space[4] },
      ]}
    >
      {me.isError ? (
        <>
          <Text variant="heading" accessibilityRole="alert" style={styles.message}>
            {tr('account:loadFailed')}
          </Text>
          <Button
            size="big"
            title={tr('account:tryAgain')}
            onPress={() => void me.refetch()}
            loading={me.isFetching}
          />
          <Button kind="link" title={tr('account:signOut')} onPress={() => signOut.mutate()} />
        </>
      ) : (
        <ActivityIndicator
          accessibilityLabel={tr('account:loading')}
          color={t.color.brandAccent}
          size="large"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  message: { textAlign: 'center' },
});
