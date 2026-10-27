import { View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme/theme';
import { DirectionalGlyph } from '@/ui/DirectionalGlyph';
import { RoundButton } from '@/ui/RoundButton';
import { Text } from '@/ui/Text';

/** The floating back button at the start of a map screen's top row. */
export function BackButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <RoundButton accessibilityLabel={t('common:back')} onPress={onPress}>
      <DirectionalGlyph variant="title" style={{ lineHeight: 30 }}>
        ‹
      </DirectionalGlyph>
    </RoundButton>
  );
}

/** The floating menu button of a home screen (opens Account). */
export function MenuButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <RoundButton accessibilityLabel={t('account:title')} onPress={onPress}>
      <Text variant="heading" style={{ fontSize: 22, lineHeight: 26 }}>
        ≡
      </Text>
    </RoundButton>
  );
}

/** The floating wallet button of the driver home (opens Earnings), drawn from tokens (the app has no icon set yet). */
export function WalletButton({ onPress, label }: { onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <RoundButton accessibilityLabel={label} onPress={onPress}>
      <View
        style={{
          width: 22,
          height: 16,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: t.color.text,
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingEnd: 2,
        }}
      >
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: t.color.text }} />
      </View>
    </RoundButton>
  );
}
