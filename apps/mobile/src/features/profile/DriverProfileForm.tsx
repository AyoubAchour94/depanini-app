import {
  type DriverProfile,
  type DriverProfileInput,
  driverProfileInputSchema,
  type TruckType,
} from '@depanini/shared';
import { type ReactNode, useState } from 'react';

import { useSaveDriverProfile } from '@/api/me';
import { AuthLayout, type AuthLayoutProps } from '@/features/auth/AuthLayout';
import { useTranslation } from '@/i18n';
import { Button } from '@/ui/Button';
import { ChoiceField } from '@/ui/ChoiceField';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

import { type FieldErrors, fieldErrorsOf, PersonalFields, SaveError } from './form-parts';
import { truckTypeOptions } from './truck-types';

const personalSchema = driverProfileInputSchema.pick({ fullName: true, phone: true });

interface DriverProfileFormProps {
  /** The saved profile, when editing one. */
  initial?: DriverProfile;
  /**
   * `onboarding` asks for personal details, then truck details, on two steps;
   * `edit` shows every field at once.
   */
  mode: 'onboarding' | 'edit';
  onSaved?: () => void;
  /** The screen frame: title, subtitle and so on. */
  layout: Omit<AuthLayoutProps, 'children' | 'action' | 'error'>;
  /** Shown under the pinned action (a sign-out link in onboarding). */
  footer?: ReactNode;
}

/** Name, phone, truck type and plate, checked with the same schema the API uses. */
export function DriverProfileForm({
  initial,
  mode,
  onSaved,
  layout,
  footer,
}: DriverProfileFormProps) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [truckType, setTruckType] = useState<TruckType | undefined>(initial?.truckType);
  const [plateNumber, setPlateNumber] = useState(initial?.plateNumber ?? '');
  const [step, setStep] = useState<'personal' | 'truck'>('personal');
  const [errors, setErrors] = useState<FieldErrors<keyof DriverProfileInput>>({});
  const save = useSaveDriverProfile();

  const next = () => {
    const result = personalSchema.safeParse({ fullName, phone });
    setErrors(result.success ? {} : fieldErrorsOf(result.error));
    if (result.success) setStep('truck');
  };

  const submit = () => {
    const result = driverProfileInputSchema.safeParse({ fullName, phone, truckType, plateNumber });
    if (!result.success) {
      setErrors(fieldErrorsOf(result.error));
      return;
    }
    setErrors({});
    save.mutate(result.data, { onSuccess: onSaved });
  };

  const showPersonal = mode === 'edit' || step === 'personal';
  const showTruck = mode === 'edit' || step === 'truck';

  const action = (
    <>
      {save.isError ? <SaveError /> : null}
      {showTruck ? (
        <Button
          size="big"
          title={mode === 'onboarding' ? t('profile:finish') : t('profile:save')}
          onPress={submit}
          loading={save.isPending}
        />
      ) : (
        <Button size="big" title={t('profile:next')} onPress={next} />
      )}
      {mode === 'onboarding' && step === 'truck' ? (
        <Button kind="link" title={t('profile:back')} onPress={() => setStep('personal')} />
      ) : null}
      {footer}
    </>
  );

  return (
    <AuthLayout {...layout} action={action}>
      {mode === 'onboarding' ? (
        <Text variant="label" tone="muted">
          {step === 'personal' ? t('profile:step1') : t('profile:step2')}
        </Text>
      ) : null}
      {showPersonal ? (
        <PersonalFields
          fullName={fullName}
          phone={phone}
          onChangeFullName={setFullName}
          onChangePhone={setPhone}
          errors={errors}
          onSubmitEditing={mode === 'onboarding' ? next : undefined}
        />
      ) : null}
      {showTruck ? (
        <>
          <ChoiceField
            label={t('profile:truckType')}
            options={truckTypeOptions()}
            value={truckType}
            onChange={setTruckType}
            error={errors.truckType}
          />
          <TextField
            label={t('profile:plateNumber')}
            value={plateNumber}
            onChangeText={setPlateNumber}
            error={errors.plateNumber}
            placeholder={t('profile:platePlaceholder')}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={submit}
          />
        </>
      ) : null}
    </AuthLayout>
  );
}
