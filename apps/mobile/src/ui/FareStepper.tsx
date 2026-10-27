import { Pressable, StyleSheet, View } from 'react-native';

import { clampFare, FARE_LONG_STEP, FARE_STEP } from '@/features/request/fare';
import { useRequestStrings } from '@/features/request/strings';
import { useTheme } from '@/theme/theme';

import { Text } from './Text';

interface FareStepperProps {
  fare: number;
  min: number;
  max: number;
  onChange: (fare: number) => void;
}

/** A ± control for a fare in dinars: 1 per press, 5 on long press, clamped to `min`–`max`. */
export function FareStepper({ fare, min, max, onChange }: FareStepperProps) {
  const t = useRequestStrings();
  const step = (delta: number) => onChange(clampFare(fare + delta, min, max));
  return (
    <View style={styles.stepper}>
      <StepButton
        label={t.decreaseFare}
        symbol="−"
        disabled={fare <= min}
        onPress={() => step(-FARE_STEP)}
        onLongPress={() => step(-FARE_LONG_STEP)}
      />
      <Text variant="figure" accessibilityLiveRegion="polite" testID="fare-amount">
        {t.fareAmount(fare)}
      </Text>
      <StepButton
        label={t.increaseFare}
        symbol="+"
        disabled={fare >= max}
        onPress={() => step(FARE_STEP)}
        onLongPress={() => step(FARE_LONG_STEP)}
      />
    </View>
  );
}

function StepButton({
  label,
  symbol,
  disabled,
  onPress,
  onLongPress,
}: {
  label: string;
  symbol: string;
  disabled: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.stepButton,
        {
          backgroundColor: theme.color.surface2,
          borderRadius: theme.radius.full,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Text variant="title" style={styles.stepSymbol}>
        {symbol}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepButton: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  stepSymbol: { fontSize: 28, lineHeight: 32 },
});
