import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/theme/theme';

interface RoundButtonProps {
  /** The icon or glyph inside. */
  children: ReactNode;
  onPress: () => void;
  /** Required: the button has no visible text. */
  accessibilityLabel: string;
  /**
   * `float` is a floating control over the map (surface, shadow, 48px);
   * `field` a neutral fill inside a sheet (56px); `brand` the brand colour.
   */
  tone?: 'float' | 'field' | 'brand';
  disabled?: boolean;
}

const SIZE = { float: 48, field: 56, brand: 56 } as const;

/** A round icon button. */
export function RoundButton({
  children,
  onPress,
  accessibilityLabel,
  tone = 'float',
  disabled,
}: RoundButtonProps) {
  const t = useTheme();
  const size = SIZE[tone];
  const fill = { float: t.color.surface, field: t.color.surface2, brand: t.color.brand }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fill,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: tone === 'float' ? t.shadow.float : t.shadow.none,
        borderWidth: tone === 'float' && t.scheme === 'dark' ? 1 : 0,
        borderColor: t.color.line,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
