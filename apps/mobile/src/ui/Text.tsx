import { Platform, Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';

import { useDirection } from '@/i18n/direction';
import { useTheme } from '@/theme/theme';
import type { Colors, TypeVariant } from '@/theme/tokens';

export interface TextProps extends RNTextProps {
  /** A step of the type scale (`t.type`). */
  variant?: TypeVariant;
  /** A text colour from the theme. */
  tone?: 'text' | 'muted' | 'brand' | 'onBrand' | 'success' | 'warning' | 'danger';
}

const toneColor: Record<NonNullable<TextProps['tone']>, keyof Colors> = {
  text: 'text',
  muted: 'muted',
  brand: 'brandText',
  onBrand: 'onBrand',
  success: 'successText',
  warning: 'warning',
  danger: 'danger',
};

/** Themed text: Inter (IBM Plex Sans Arabic in Arabic) at a step of the type scale, in a colour from the theme. */
export function Text({ variant = 'body', tone = 'text', style, ...props }: TextProps) {
  const t = useTheme();
  const direction = useDirection();
  // React Native Web aligns each text by its own first letter, so a Latin address or a
  // phone number in an Arabic screen would sit on the left. Align it to the start of the
  // layout, the right; its letters keep their own order ("+216 22 333 444" stays as is).
  const align = Platform.OS === 'web' && direction === 'rtl' ? styles.right : undefined;
  return (
    <RNText
      {...props}
      style={[t.type[variant], align, { color: t.color[toneColor[tone]] as string }, style]}
    />
  );
}

const styles = StyleSheet.create({ right: { textAlign: 'right' } });
