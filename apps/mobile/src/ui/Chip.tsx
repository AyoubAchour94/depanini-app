import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme';

import { Text } from './Text';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** `radio` when the chip is one of an exclusive set; `none` when it only states something ("Cash") and cannot be pressed. */
  role?: 'button' | 'radio' | 'none';
  /** A small leading icon or glyph. */
  icon?: ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** A selectable pill: outlined, filled with the brand tint when selected. */
export function Chip({
  label,
  selected = false,
  onPress,
  role = 'button',
  icon,
  disabled,
  accessibilityLabel,
}: ChipProps) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={role === 'none' ? undefined : role}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={
        role === 'radio' ? { checked: selected, disabled } : { selected, disabled }
      }
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: t.radius.full,
          borderColor: selected ? t.color.brandAccent : t.color.line,
          backgroundColor: selected ? t.color.brandTint : 'transparent',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {icon ? <View>{icon}</View> : null}
      <Text variant={selected ? 'label' : 'caption'} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
  },
  label: { fontSize: 14 },
});
