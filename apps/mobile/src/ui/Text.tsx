import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

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
  brand: 'brand',
  onBrand: 'onBrand',
  success: 'successText',
  warning: 'warning',
  danger: 'danger',
};

/** Themed text: Inter at a step of the type scale, in a colour from the theme. */
export function Text({ variant = 'body', tone = 'text', style, ...props }: TextProps) {
  const t = useTheme();
  return (
    <RNText
      {...props}
      style={[t.type[variant], { color: t.color[toneColor[tone]] as string }, style]}
    />
  );
}
