import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme';

import { Text } from './Text';

export type PillTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

interface PillProps {
  label: string;
  /**
   * `neutral` is the floating status pill over the map (surface, shadow, 44px);
   * the other tones are small tinted tags ("Your fare", "New") .
   */
  tone?: PillTone;
  /** A small leading icon. */
  icon?: ReactNode;
  /** A coloured status dot before the label, for the neutral pill ("Live"). */
  dot?: boolean;
}

/** A status pill or tag. */
export function Pill({ label, tone = 'neutral', icon, dot }: PillProps) {
  const t = useTheme();
  const c = t.color;
  const tinted = {
    brand: { bg: c.brandTint, fg: c.brandText },
    success: { bg: c.successTint, fg: c.successText },
    warning: { bg: c.warningTint, fg: c.warning },
    danger: { bg: c.dangerTint, fg: c.danger },
  } as const;

  if (tone === 'neutral') {
    return (
      <View
        style={[
          styles.floating,
          {
            backgroundColor: c.surface,
            borderRadius: t.radius.full,
            boxShadow: t.shadow.float,
            borderWidth: t.scheme === 'dark' ? 1 : 0,
            borderColor: c.line,
          },
        ]}
      >
        {dot ? <View style={[styles.dot, { backgroundColor: c.success }]} /> : null}
        {icon}
        <Text variant="bodyStrong" style={styles.floatingLabel}>
          {label}
        </Text>
      </View>
    );
  }

  const { bg, fg } = tinted[tone];
  return (
    <View style={[styles.tag, { backgroundColor: bg, borderRadius: t.radius.xs }]}>
      {icon}
      <Text variant="micro" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  floating: {
    height: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  floatingLabel: { fontSize: 15 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
});
