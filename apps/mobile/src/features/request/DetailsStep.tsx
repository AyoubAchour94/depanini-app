import {
  PROBLEM_TYPES,
  type ProblemType,
  problemTypeSchema,
  VEHICLE_TYPES,
  type VehicleType,
  vehicleTypeSchema,
} from '@depanini/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceField } from '@/ui/ChoiceField';
import { TextField } from '@/ui/TextField';

import { requestStrings as t } from './strings';

const NOTE_MAX_LENGTH = 280;

const VEHICLE_OPTIONS = VEHICLE_TYPES.map((value) => ({
  value,
  label: t.vehicleOptions[value],
}));
const PROBLEM_OPTIONS = PROBLEM_TYPES.map((value) => ({
  value,
  label: t.problemOptions[value],
}));

export interface Details {
  vehicleType: VehicleType;
  problemType: ProblemType;
  note: string;
}

interface DetailsStepProps {
  /** What was entered before, if the customer came back to this step. */
  initial?: { vehicleType: VehicleType | null; problemType: ProblemType | null; note: string };
  onConfirm: (details: Details) => void;
}

/** Third step of a tow request: which vehicle, what went wrong, and an optional note. */
export function DetailsStep({ initial, onConfirm }: DetailsStepProps) {
  const theme = useTheme();
  const [vehicleType, setVehicleType] = useState<VehicleType | undefined>(
    initial?.vehicleType ?? undefined,
  );
  const [problemType, setProblemType] = useState<ProblemType | undefined>(
    initial?.problemType ?? undefined,
  );
  const [note, setNote] = useState(initial?.note ?? '');
  const [submitted, setSubmitted] = useState(false);

  const vehicle = vehicleTypeSchema.safeParse(vehicleType);
  const problem = problemTypeSchema.safeParse(problemType);

  const submit = () => {
    setSubmitted(true);
    if (vehicle.success && problem.success) {
      onConfirm({ vehicleType: vehicle.data, problemType: problem.data, note: note.trim() });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.form}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: theme.background }}
    >
      <ChoiceField
        label={t.vehicleLabel}
        options={VEHICLE_OPTIONS}
        value={vehicleType}
        onChange={setVehicleType}
        error={submitted && !vehicle.success ? vehicle.error.issues[0]?.message : undefined}
      />
      <ChoiceField
        wrap
        label={t.problemLabel}
        options={PROBLEM_OPTIONS}
        value={problemType}
        onChange={setProblemType}
        error={submitted && !problem.success ? problem.error.issues[0]?.message : undefined}
      />
      <View style={styles.note}>
        <TextField
          label={t.noteLabel}
          placeholder={t.notePlaceholder}
          value={note}
          onChangeText={setNote}
          maxLength={NOTE_MAX_LENGTH}
          multiline
          style={styles.noteInput}
        />
        <Text style={[styles.counter, { color: theme.textMuted }]}>
          {note.length}/{NOTE_MAX_LENGTH}
        </Text>
      </View>
      <Button title={t.next} onPress={submit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  form: { padding: 16, gap: 16 },
  note: { gap: 4 },
  noteInput: { minHeight: 90, textAlignVertical: 'top' },
  counter: { fontSize: 13, textAlign: 'right' },
});
