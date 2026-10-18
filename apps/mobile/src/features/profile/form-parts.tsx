import type { z } from 'zod';
import { Text } from 'react-native';

import { useTheme } from '@/theme/theme';
import { TextField } from '@/ui/TextField';

/** Validation messages by field name; the first issue per field wins. */
export type FieldErrors = Partial<Record<string, string>>;

export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}

interface PersonalFieldsProps {
  fullName: string;
  phone: string;
  onChangeFullName: (value: string) => void;
  onChangePhone: (value: string) => void;
  errors: FieldErrors;
  onSubmitEditing?: () => void;
}

/** Name and contact phone; both profiles start with these. */
export function PersonalFields({
  fullName,
  phone,
  onChangeFullName,
  onChangePhone,
  errors,
  onSubmitEditing,
}: PersonalFieldsProps) {
  return (
    <>
      <TextField
        label="Full name"
        value={fullName}
        onChangeText={onChangeFullName}
        error={errors.fullName}
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label="Phone"
        value={phone}
        onChangeText={onChangePhone}
        error={errors.phone}
        placeholder="+216 98 123 456"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        onSubmitEditing={onSubmitEditing}
      />
    </>
  );
}

/** Shown when the API didn't accept a save. */
export function SaveError() {
  const theme = useTheme();
  return (
    <Text accessibilityRole="alert" style={{ color: theme.danger }}>
      Could not save your details. Check your connection and try again.
    </Text>
  );
}
