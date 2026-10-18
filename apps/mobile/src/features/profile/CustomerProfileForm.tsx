import { type CustomerProfile, customerProfileInputSchema } from '@depanini/shared';
import { useState } from 'react';

import { useSaveCustomerProfile } from '@/api/me';
import { Button } from '@/ui/Button';

import { type FieldErrors, fieldErrorsOf, PersonalFields, SaveError } from './form-parts';

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
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
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
    <>
      <PersonalFields
        fullName={fullName}
        phone={phone}
        onChangeFullName={setFullName}
        onChangePhone={setPhone}
        errors={errors}
        onSubmitEditing={submit}
      />
      {save.isError ? <SaveError /> : null}
      <Button title={submitTitle} onPress={submit} loading={save.isPending} />
    </>
  );
}
