import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/theme/theme';

import { Text } from './Text';

export type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'md' | 'sm' | 'big';

interface ButtonProps {
  title: string;
  onPress: () => void;
  /**
   * `primary` is filled with the brand colour, `secondary` with a neutral
   * fill, `danger` with the danger colour (destructive actions); `ghost` and
   * `link` are plain text (`ghost` is a full-height row, `link` is inline).
   */
  kind?: ButtonKind;
  /** `md` 56px, `sm` 44px, `big` 64px: the one next action pinned at the bottom of a screen. */
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Read by screen readers (and tests) instead of the title, to tell apart buttons with the same title. */
  accessibilityLabel?: string;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 44, md: 56, big: 64 };
const TEXT = { sm: 'buttonSmall', md: 'button', big: 'buttonBig' } as const;

export function Button({
  title,
  onPress,
  kind = 'primary',
  size = 'md',
  loading,
  disabled,
  accessibilityLabel,
}: ButtonProps) {
  const t = useTheme();
  const inactive = disabled || loading;

  if (kind === 'link') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        disabled={inactive}
        hitSlop={8}
      >
        <Text variant="bodyStrong" tone="brand" style={styles.link}>
          {title}
        </Text>
      </Pressable>
    );
  }

  const fills = {
    primary: { bg: t.color.brand, fg: t.color.onBrand },
    secondary: { bg: t.color.surface2, fg: t.color.text },
    danger: { bg: t.color.dangerFill, fg: t.color.onDanger },
    ghost: { bg: 'transparent', fg: t.color.muted },
  } as const;
  const fill = fills[kind];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          height: kind === 'ghost' ? 48 : HEIGHT[size],
          borderRadius: size === 'sm' ? t.radius.md : t.radius.lg,
          backgroundColor: fill.bg,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fill.fg} />
      ) : (
        <Text variant={TEXT[size]} style={{ color: fill.fg }}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  link: { textAlign: 'center' },
});
