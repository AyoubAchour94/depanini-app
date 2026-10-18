import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme';

interface ChoiceFieldProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** Validation message shown under the choices. */
  error?: string;
}

/** A labelled single choice from a few options, shown as a row of buttons. */
export function ChoiceField<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: ChoiceFieldProps<T>) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.options}>
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
                {
                  backgroundColor: selected ? theme.brand : theme.surface,
                  borderColor: error ? theme.danger : selected ? theme.brand : theme.surface,
                },
              ]}
            >
              <Text style={[styles.optionText, { color: selected ? theme.onBrand : theme.text }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  optionText: { fontSize: 16, fontWeight: '600' },
  error: { fontSize: 13 },
});
