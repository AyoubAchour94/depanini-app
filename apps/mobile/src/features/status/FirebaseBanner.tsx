import { StyleSheet, View } from 'react-native';

import { getFirebaseStatus } from '@/firebase/firebase';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme/theme';
import { Text } from '@/ui/Text';

/** Debug-only notice when Firebase is not configured; renders nothing otherwise. */
export function FirebaseBanner() {
  const { t } = useTranslation();
  const theme = useTheme();
  if (!__DEV__ || getFirebaseStatus().configured) return null;

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: theme.color.warningTint, borderRadius: theme.radius.md },
      ]}
    >
      <Text variant="bodyStrong" tone="warning">
        {t('status:firebaseMissing')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 12, paddingVertical: 6 },
});
