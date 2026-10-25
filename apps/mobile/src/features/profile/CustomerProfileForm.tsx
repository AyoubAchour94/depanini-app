import {
  type CustomerProfile,
  type CustomerProfileInput,
  customerProfileInputSchema,
} from '@depanini/shared';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { useSaveCustomerProfile } from '@/api/me';
import { AuthLayout, type AuthLayoutProps } from '@/features/auth/AuthLayout';
import { Button } from '@/ui/Button';

import { type FieldErrors, fieldErrorsOf, PersonalFields, SaveError } from './form-parts';

interface CustomerProfileFormProps {
  /** The saved profile, when editing one. */
  initial?: CustomerProfile;
  submitTitle: string;
  onSaved?: () => void;
  /** The screen frame: title, subtitle and so on. */
  layout: Omit<AuthLayoutProps, 'children' | 'action' | 'error'>;
  /** Shown under the pinned action (a sign-out link in onboarding). */
  footer?: ReactNode;
}

/**
 * Name and contact phone, checked with the same schema the API uses. Shared
 * by onboarding and the profile screen.
 */
export function CustomerProfileForm({
  initial,
  submitTitle,
  onSaved,
  layout,
  footer,
}: CustomerProfileFormProps) {
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [errors, setErrors] = useState<FieldErrors<keyof CustomerProfileInput>>({});
  const save = useSaveCustomerProfile();

  const submit = () => {
    const result = customerProfileInputSchema.safeParse({ fullName, phone });
    if (!result.success) {
      setErrors(fieldErrorsOf(result.error));
      return;
    }
    setErrors({});
    save.mutate(result.data, { onSuccess: onSaved });
  };

  return (
    <AuthLayout
      {...layout}
      action={
        <>
          {save.isError ? <SaveError /> : null}
          <Button size="big" title={submitTitle} onPress={submit} loading={save.isPending} />
          {footer}
        </>
      }
    >
      <PersonalFields
        fullName={fullName}
        phone={phone}
        onChangeFullName={setFullName}
        onChangePhone={setPhone}
        errors={errors}
        onSubmitEditing={submit}
      />
    </AuthLayout>
  );
}
