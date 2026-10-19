import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { useTheme } from '@/theme/theme';

import { Text } from './Text';

interface TextFieldProps extends TextInputProps {
  label: string;
  /** Validation message shown under the input. */
  error?: string;
}

/** A labelled text input in the app's theme. */
export function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.color.muted}
        style={[
          t.type.body,
          styles.input,
          {
            backgroundColor: t.color.surface2,
            color: t.color.text,
            borderRadius: t.radius.md,
            borderColor: error ? t.color.danger : 'transparent',
          },
          style,
        ]}
        {...inputProps}
      />
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
  input: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1 },
});
