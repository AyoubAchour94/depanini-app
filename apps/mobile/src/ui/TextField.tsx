import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { useTheme } from '@/theme/theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  /** Validation message shown under the input. */
  error?: string;
}

/** A labelled text input in the app's theme. */
export function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.textMuted}
        style={[
          styles.input,
          { backgroundColor: theme.surface, color: theme.text },
          error ? { borderColor: theme.danger, borderWidth: 1 } : null,
          style,
        ]}
        {...inputProps}
      />
      {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  error: { fontSize: 13 },
});
