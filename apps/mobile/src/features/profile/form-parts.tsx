import type { z } from 'zod';

import { useTranslation } from '@/i18n';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

/** Validation messages by field name. */
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

/** The first message per field from a failed parse of a form's schema. */
export function fieldErrorsOf<Field extends string>(error: z.ZodError): FieldErrors<Field> {
  const errors: FieldErrors<Field> = {};
  for (const issue of error.issues) errors[String(issue.path[0]) as Field] ??= issue.message;
  return errors;
}

interface PersonalFieldsProps {
  fullName: string;
  phone: string;
  onChangeFullName: (value: string) => void;
  onChangePhone: (value: string) => void;
  errors: FieldErrors<'fullName' | 'phone'>;
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
  const { t } = useTranslation();
  return (
    <>
      <TextField
        label={t('profile:fullName')}
        value={fullName}
        onChangeText={onChangeFullName}
        error={errors.fullName}
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label={t('profile:phone')}
        value={phone}
        onChangeText={onChangePhone}
        error={errors.phone}
        placeholder={t('profile:phonePlaceholder')}
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
  const { t } = useTranslation();
  return (
    <Text accessibilityRole="alert" tone="danger" variant="bodyStrong">
      {t('profile:saveFailed')}
    </Text>
  );
}
