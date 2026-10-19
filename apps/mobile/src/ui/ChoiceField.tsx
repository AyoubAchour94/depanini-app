import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme';

import { Text } from './Text';

interface ChoiceFieldProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** Validation message shown under the choices. */
  error?: string;
  /** Wrap onto several rows instead of one (for many options). */
  wrap?: boolean;
}

/** A labelled single choice from a few options, shown as a row of buttons. */
export function ChoiceField<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  wrap,
}: ChoiceFieldProps<T>) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="label">{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={[styles.options, wrap && styles.wrap]}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.option,
                wrap && styles.optionWrapped,
                {
                  borderRadius: t.radius.md,
                  backgroundColor: selected ? t.color.brandTint : t.color.surface2,
                  borderColor: error ? t.color.danger : selected ? t.color.brand : 'transparent',
                },
              ]}
            >
              <Text variant={selected ? 'bodyStrong' : 'body'} style={styles.optionText}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  options: { flexDirection: 'row', gap: 8 },
  wrap: { flexWrap: 'wrap' },
  option: {
    flex: 1,
    borderWidth: 1.5,
    minHeight: 48,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionWrapped: { flexGrow: 1, flexBasis: '30%', paddingHorizontal: 6 },
  optionText: { textAlign: 'center' },
});
