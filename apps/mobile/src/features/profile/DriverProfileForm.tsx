import {
  type DriverProfile,
  type DriverProfileInput,
  driverProfileInputSchema,
  type TruckType,
} from '@depanini/shared';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSaveDriverProfile } from '@/api/me';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceField } from '@/ui/ChoiceField';
import { TextField } from '@/ui/TextField';

import { type FieldErrors, fieldErrorsOf, PersonalFields, SaveError } from './form-parts';
import { TRUCK_TYPE_OPTIONS } from './truck-types';

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
}

/** Name, phone, truck type and plate, checked with the same schema the API uses. */
export function DriverProfileForm({ initial, mode, onSaved }: DriverProfileFormProps) {
  const theme = useTheme();
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

  return (
    <>
      {mode === 'onboarding' ? (
        <Text style={[styles.step, { color: theme.textMuted }]}>
          {step === 'personal' ? 'Step 1 of 2: your details' : 'Step 2 of 2: your truck'}
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
            label="Truck type"
            options={TRUCK_TYPE_OPTIONS}
            value={truckType}
            onChange={setTruckType}
            error={errors.truckType}
          />
          <TextField
            label="Plate number"
            value={plateNumber}
            onChangeText={setPlateNumber}
            error={errors.plateNumber}
            placeholder="123 TU 4567"
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={submit}
          />
        </>
      ) : null}
      {save.isError ? <SaveError /> : null}
      {showTruck ? (
        <Button
          title={mode === 'onboarding' ? 'Finish' : 'Save'}
          onPress={submit}
          loading={save.isPending}
        />
      ) : (
        <Button title="Next" onPress={next} />
      )}
      {mode === 'onboarding' && step === 'truck' ? (
        <Button kind="link" title="Back" onPress={() => setStep('personal')} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  step: { fontSize: 14, fontWeight: '600' },
});
