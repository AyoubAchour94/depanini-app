import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme';

import { tripStrings as t } from './strings';

const STARS = [1, 2, 3, 4, 5] as const;

/** Five stars; pressing one picks that rating. Each star is a labelled button ("4 stars"). */
export function StarRatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (stars: number) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View accessibilityLabel={t.starsGroup} style={styles.row}>
      {STARS.map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={t.starsLabel(n)}
          accessibilityState={{ selected: n === value, disabled }}
          disabled={disabled}
          hitSlop={4}
          onPress={() => onChange(n)}
        >
          <Text style={[styles.star, { color: n <= value ? theme.warning : theme.textMuted }]}>
            {n <= value ? '★' : '☆'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  star: { fontSize: 36 },
});
