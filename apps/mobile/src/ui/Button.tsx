import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { contrastingTextColor, useTheme } from '@/theme/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  /**
   * `primary` is filled with the brand color, `danger` with the danger color
   * (for destructive actions); `link` is plain text.
   */
  kind?: 'primary' | 'danger' | 'link';
  loading?: boolean;
  disabled?: boolean;
}

export function Button({ title, onPress, kind = 'primary', loading, disabled }: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const fill = kind === 'danger' ? theme.danger : theme.brand;
  const onFill = kind === 'danger' ? contrastingTextColor(theme.danger) : theme.onBrand;

  if (kind === 'link') {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} disabled={inactive} hitSlop={8}>
        <Text style={[styles.link, { color: theme.brand }]}>{title}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.primary,
        {
          backgroundColor: fill,
          opacity: inactive ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={onFill} />
      ) : (
        <Text style={[styles.primaryText, { color: onFill }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryText: { fontSize: 16, fontWeight: '600' },
  link: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
