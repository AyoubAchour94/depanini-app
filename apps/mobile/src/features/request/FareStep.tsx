import type { TowRequest } from '@depanini/shared';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useCreateTowRequest, useFareEstimate } from '@/api/towRequests';
import { BackButton } from '@/features/map/controls';
import { MapScreen } from '@/features/map/MapScreen';
import { shortAddress } from '@/features/places/address';
import { registerForPush } from '@/push';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Divider } from '@/ui/Divider';
import { FareStepper } from '@/ui/FareStepper';
import { Pill } from '@/ui/Pill';
import { RangeBar } from '@/ui/RangeBar';
import { Text } from '@/ui/Text';

import { clampFare, towMinutes } from './fare';
import { useRequestFlow } from './RequestFlowContext';
import { requestStrings as t } from './strings';

/** Snap points of the fare sheet: the route, the offer, the range bar, the chips and the pinned action fit at the first. */
const FARE_SNAPS = [520, 'full'] as const;

interface FareStepProps {
  onCreated: (request: TowRequest) => void;
  /** The customer already has an open request (409). */
  onAlreadyOpen: () => void;
  /** The account has no customer profile (403). */
  onNoProfile: () => void;
  /** Goes back to the previous step; the back button shows only when given. */
  onBack?: () => void;
}

/**
 * Last step of a tow request: the estimated fare, which the customer may
 * adjust within the allowed range, and the submit.
 */
export function FareStep({ onCreated, onAlreadyOpen, onNoProfile, onBack }: FareStepProps) {
  const theme = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const flow = useRequestFlow();
  const { pickup, dropoff, vehicleType, problemType, note, proposedFare, setProposedFare } = flow;
  const complete = pickup && dropoff && vehicleType && problemType;

  const estimate = useFareEstimate(complete ? { pickup, dropoff, vehicleType } : null);
  const create = useCreateTowRequest();

  if (!complete) return null;

  if (estimate.isPending || (estimate.isFetching && !estimate.data)) {
    return (
      <View style={[styles.center, { backgroundColor: theme.color.background }]}>
        <ActivityIndicator color={theme.color.brandAccent} />
        <Text tone="muted">{t.estimating}</Text>
      </View>
    );
  }
  if (!estimate.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.color.background }]}>
        <Text tone="danger" style={styles.message}>
          {t.estimateFailed}
        </Text>
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
    <MapScreen
      markers={[
        { id: 'pickup', kind: 'pickup', coordinate: pickup },
        { id: 'dropoff', kind: 'dropoff', coordinate: dropoff },
      ]}
      fitToMarkers
      // Keep both pins above the sheet, which can be at most 60% of a short screen.
      fitInsetBottom={Math.min(FARE_SNAPS[0], windowHeight * 0.6)}
      topStart={onBack ? <BackButton onPress={onBack} /> : undefined}
      pill={<Pill label={t.routeStats((distanceM / 1000).toFixed(1), towMinutes(distanceM))} />}
      sheet={{
        snapPoints: FARE_SNAPS,
        children: (
          <View style={{ gap: theme.space[3] }}>
            <View style={{ gap: theme.space[3] }}>
              <RouteRow
                label={t.pickupTitle}
                address={pickup.address}
                marker={<View style={[styles.dot, { backgroundColor: theme.color.map.pickup }]} />}
              />
              <RouteRow
                label={t.dropoffTitle}
                address={dropoff.address}
                marker={
                  <View style={[styles.square, { backgroundColor: theme.color.map.dropoff }]} />
                }
              />
            </View>
            <Divider />
            <View style={styles.offerHeader}>
              <Text variant="heading">{t.yourOffer}</Text>
              <Text tone="muted">
                {t.suggestedLabel} <Text variant="bodyStrong">{t.fareAmount(suggestedFare)}</Text>
              </Text>
            </View>
            <FareStepper fare={fare} min={minFare} max={maxFare} onChange={setProposedFare} />
            <RangeBar
              value={fare}
              min={minFare}
              max={maxFare}
              suggested={suggestedFare}
              format={t.fareAmount}
              hint={t.fareHint}
            />
            <View style={styles.chips}>
              <Chip
                role="none"
                label={t.vehicleAndProblem(
                  t.vehicleOptions[vehicleType],
                  t.problemOptions[problemType],
                )}
              />
              <Chip role="none" label={t.cash} />
            </View>
            <Text variant="caption" tone="muted">
              {t.fareExplainer}
            </Text>
          </View>
        ),
        footer: (
          <View style={{ gap: theme.space[2] }}>
            {failure ? (
              <Text variant="caption" tone="danger">
                {failure}
              </Text>
            ) : null}
            <Button
              size="big"
              title={t.sendRequestFor(fare)}
              loading={create.isPending}
              onPress={submit}
            />
          </View>
        ),
      }}
    />
  );
}

function RouteRow({
  label,
  address,
  marker,
}: {
  label: string;
  address: string;
  marker: ReactNode;
}) {
  return (
    <View style={styles.routeRow}>
      <View style={styles.marker}>{marker}</View>
      <View style={styles.routeText}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="bodyStrong">{shortAddress(address)}</Text>
      </View>
    </View>
  );
}

/** 403 and 409 leave the screen instead of showing an error. */
function isRedirect(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 409);
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { textAlign: 'center' },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  marker: { width: 14, alignItems: 'center' },
  routeText: { flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  square: { width: 12, height: 12, borderRadius: 2 },
  offerHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
