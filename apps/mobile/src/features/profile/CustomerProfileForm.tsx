import { type CustomerProfile, customerProfileInputSchema } from '@depanini/shared';
import { useState } from 'react';
import { Text } from 'react-native';

import { useSaveCustomerProfile } from '@/api/me';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';

type Field = keyof CustomerProfile;

interface CustomerProfileFormProps {
  /** The saved profile, when editing one. */
  initial?: CustomerProfile;
  submitTitle: string;
  onSaved?: () => void;
}

/**
 * Name and contact phone, checked with the same schema the API uses. Shared
 * by onboarding and the profile screen.
 */
export function CustomerProfileForm({ initial, submitTitle, onSaved }: CustomerProfileFormProps) {
  const theme = useTheme();
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const save = useSaveCustomerProfile();

  const submit = () => {
    const result = customerProfileInputSchema.safeParse({ fullName, phone });
    if (!result.success) {
      const fieldErrors: Partial<Record<Field, string>> = {};
      for (const issue of result.error.issues)
        fieldErrors[issue.path[0] as Field] ??= issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    save.mutate(result.data, { onSuccess: onSaved });
  };

  return (
    <>
      <TextField
        label="Full name"
        value={fullName}
        onChangeText={setFullName}
        error={errors.fullName}
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        error={errors.phone}
        placeholder="+216 98 123 456"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        onSubmitEditing={submit}
      />
      {save.isError ? (
        <Text accessibilityRole="alert" style={{ color: theme.danger }}>
          Could not save your details. Check your connection and try again.
        </Text>
      ) : null}
      <Button title={submitTitle} onPress={submit} loading={save.isPending} />
    </>
  );
}
