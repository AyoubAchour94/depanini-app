import { Pressable, StyleSheet, Text, View } from 'react-native';

import { clampFare, FARE_LONG_STEP, FARE_STEP } from '@/features/request/fare';
import { requestStrings as t } from '@/features/request/strings';
import { useTheme } from '@/theme/theme';

interface FareStepperProps {
  fare: number;
  min: number;
  max: number;
  onChange: (fare: number) => void;
}

/** A ± control for a fare in dinars: 1 per press, 5 on long press, clamped to `min`–`max`. */
export function FareStepper({ fare, min, max, onChange }: FareStepperProps) {
  const theme = useTheme();
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
      <Text accessibilityLiveRegion="polite" style={[styles.fare, { color: theme.text }]}>
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
      style={[styles.stepButton, { backgroundColor: theme.surface, opacity: disabled ? 0.4 : 1 }]}
    >
      <Text style={[styles.stepSymbol, { color: theme.text }]}>{symbol}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSymbol: { fontSize: 28, fontWeight: '600' },
  fare: { fontSize: 36, fontWeight: '700' },
});
