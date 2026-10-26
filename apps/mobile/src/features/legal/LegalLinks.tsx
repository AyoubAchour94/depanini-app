import { Linking, View } from 'react-native';

import { env } from '@/config/env';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';

/** Opens a legal page in the browser (`expo-web-browser` is not a dependency, so `Linking`). */
export function openLegalUrl(url: string) {
  Linking.openURL(url).catch(() => undefined);
}

/** "By creating an account you accept the Terms and the Privacy policy", the two names tappable. */
export function TermsConsent() {
  return (
    <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
      By creating an account you accept the{' '}
      <Text
        variant="caption"
        tone="brand"
        accessibilityRole="link"
        onPress={() => openLegalUrl(env.termsUrl)}
      >
        Terms
      </Text>{' '}
      and the{' '}
      <Text
        variant="caption"
        tone="brand"
        accessibilityRole="link"
        onPress={() => openLegalUrl(env.privacyUrl)}
      >
        Privacy policy
      </Text>
      .
    </Text>
  );
}

/** The Account screen's "Legal" section. */
export function LegalSection() {
  const t = useTheme();
  return (
    <View style={{ gap: t.space[2] }}>
      <Text variant="bodyStrong" tone="muted">
        Legal
      </Text>
      <Button kind="secondary" title="Terms of use" onPress={() => openLegalUrl(env.termsUrl)} />
      <Button
        kind="secondary"
        title="Privacy policy"
        onPress={() => openLegalUrl(env.privacyUrl)}
      />
    </View>
  );
}
