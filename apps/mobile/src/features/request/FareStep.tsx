import type { TowRequest } from '@depanini/shared';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useCreateTowRequest, useFareEstimate } from '@/api/towRequests';
import { registerForPush } from '@/push';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { FareStepper } from '@/ui/FareStepper';

import { clampFare } from './fare';
import { useRequestFlow } from './RequestFlowContext';
import { requestStrings as t } from './strings';

interface FareStepProps {
  onCreated: (request: TowRequest) => void;
  /** The customer already has an open request (409). */
  onAlreadyOpen: () => void;
  /** The account has no customer profile (403). */
  onNoProfile: () => void;
}

/**
 * Last step of a tow request: the estimated fare, which the customer may
 * adjust within the allowed range, and the submit.
 */
export function FareStep({ onCreated, onAlreadyOpen, onNoProfile }: FareStepProps) {
  const theme = useTheme();
  const flow = useRequestFlow();
  const { pickup, dropoff, vehicleType, problemType, note, proposedFare, setProposedFare } = flow;
  const complete = pickup && dropoff && vehicleType && problemType;

  const estimate = useFareEstimate(complete ? { pickup, dropoff, vehicleType } : null);
  const create = useCreateTowRequest();

  if (!complete) return null;

  if (estimate.isPending || (estimate.isFetching && !estimate.data)) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.brand} />
        <Text style={{ color: theme.textMuted }}>{t.estimating}</Text>
      </View>
    );
  }
  if (!estimate.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.error, { color: theme.danger }]}>{t.estimateFailed}</Text>
        <Button title={t.retry} onPress={() => void estimate.refetch()} />
      </View>
    );
  }

  const { distanceM, suggestedFare, minFare, maxFare } = estimate.data;
  const fare = clampFare(proposedFare ?? suggestedFare, minFare, maxFare);

  const submit = () =>
    create.mutate(
      {
        pickup,
        dropoff,
        vehicleType,
        problemType,
        note: note.trim() || undefined,
        proposedFare: fare,
      },
      {
        onSuccess: (request) => {
          // Now there is something to be told about: the moment to ask for notifications.
          void registerForPush();
          onCreated(request);
        },
        onError: (error) => {
          const status = error instanceof ApiError ? error.status : undefined;
          if (status === 409) onAlreadyOpen();
          else if (status === 403) onNoProfile();
          // The bounds moved under us (or the request was otherwise rejected): re-read them.
          else if (status === 400) void estimate.refetch();
        },
      },
    );

  const failure =
    create.error instanceof ApiError && create.error.status === 400
      ? t.fareRejected
      : create.isError && !isRedirect(create.error)
        ? t.submitFailed
        : null;

  return (
    <ScrollView contentContainerStyle={styles.form} style={{ backgroundColor: theme.background }}>
      <Text style={[styles.muted, { color: theme.textMuted }]}>
        {t.distance((distanceM / 1000).toFixed(1))}
      </Text>
      <Text style={[styles.muted, { color: theme.textMuted }]}>
        {t.suggestedFare(suggestedFare)}
      </Text>
      <FareStepper fare={fare} min={minFare} max={maxFare} onChange={setProposedFare} />
      <Text style={[styles.muted, { color: theme.textMuted }]}>
        {t.fareRange(minFare, maxFare)}
      </Text>
      <Text style={{ color: theme.text }}>{t.fareExplainer}</Text>
      {failure ? <Text style={[styles.error, { color: theme.danger }]}>{failure}</Text> : null}
      <Button title={t.sendRequest} loading={create.isPending} onPress={submit} />
    </ScrollView>
  );
}

/** 403 and 409 leave the screen instead of showing an error. */
function isRedirect(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 409);
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  form: { padding: 16, gap: 12 },
  muted: { fontSize: 15 },
  error: { fontSize: 14 },
});
