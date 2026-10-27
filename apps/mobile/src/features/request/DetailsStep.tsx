import {
  PROBLEM_TYPES,
  type ProblemType,
  problemTypeSchema,
  VEHICLE_TYPES,
  type VehicleType,
  vehicleTypeSchema,
} from '@depanini/shared';
import { useContext, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceField } from '@/ui/ChoiceField';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

import { useRequestStrings } from './strings';

const NOTE_MAX_LENGTH = 280;

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
  const t = useRequestStrings();
  const vehicleOptions = VEHICLE_TYPES.map((value) => ({ value, label: t.vehicleOptions[value] }));
  const problemOptions = PROBLEM_TYPES.map((value) => ({ value, label: t.problemOptions[value] }));
  const theme = useTheme();
  const insets = useContext(SafeAreaInsetsContext);
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
    <View style={[styles.fill, { backgroundColor: theme.color.background }]}>
      <ScrollView
        contentContainerStyle={{ padding: theme.space[4], gap: theme.space[5] }}
        keyboardShouldPersistTaps="handled"
        style={styles.fill}
      >
        <ChoiceField
          label={t.vehicleLabel}
          options={vehicleOptions}
          value={vehicleType}
          onChange={setVehicleType}
          error={submitted && !vehicle.success ? vehicle.error.issues[0]?.message : undefined}
        />
        <ChoiceField
          wrap
          label={t.problemLabel}
          options={problemOptions}
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
          <Text variant="caption" tone="muted" style={styles.counter}>
            {t.disputeCounter(note.length, NOTE_MAX_LENGTH)}
          </Text>
        </View>
      </ScrollView>
      <View
        style={{
          paddingHorizontal: theme.space[4],
          paddingTop: theme.space[2],
          paddingBottom: Math.max(insets?.bottom ?? 0, theme.space[4]),
        }}
      >
        <Button size="big" title={t.next} onPress={submit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  note: { gap: 4 },
  noteInput: { minHeight: 90, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end' },
});
