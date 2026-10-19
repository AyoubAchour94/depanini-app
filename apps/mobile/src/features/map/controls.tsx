import { RoundButton } from '@/ui/RoundButton';
import { Text } from '@/ui/Text';

/** The floating back button at the start of a map screen's top row. */
export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <RoundButton accessibilityLabel="Back" onPress={onPress}>
      <Text variant="title" style={{ lineHeight: 30 }}>
        ‹
      </Text>
    </RoundButton>
  );
}

/** The floating menu button of a home screen (opens Account). */
export function MenuButton({ onPress }: { onPress: () => void }) {
  return (
    <RoundButton accessibilityLabel="Account" onPress={onPress}>
      <Text variant="heading" style={{ fontSize: 22, lineHeight: 26 }}>
        ≡
      </Text>
    </RoundButton>
  );
}
