import {
  canDriverCancel,
  DRIVER_CANCEL_REASONS,
  type DriverCancelReason,
  nextTripStage,
  type TowRequest,
  type TripStage,
} from '@depanini/shared';
import { router, Stack, useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useAdvanceJob, useCancelJob, useCompleteJob, useDriverJob } from '@/api/driver';
import { env } from '@/config/env';
import { MissingTokenView } from '@/features/map/MapScreen';
import { TunisMap } from '@/features/map/TunisMap';
import { requestStrings } from '@/features/request/strings';
import { LiveIndicator } from '@/realtime/LiveIndicator';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceField } from '@/ui/ChoiceField';

import { confirmCancelJob, confirmDropoff } from './confirm';
import { driverStrings as t } from './strings';
import { useTruckLocation } from './usePresence';

const goHome = () => router.replace('/');

const isConflict = (error: unknown) => error instanceof ApiError && error.status === 409;

/**
 * The job the driver has taken: who to call, where to go, the agreed fare, the
 * next trip step and a way out. After the drop-off it shows the summary.
 */
export function JobScreen() {
  const theme = useTheme();
  const focused = useIsFocused();
  const job = useDriverJob({ poll: focused });
  const cancel = useCancelJob();
  const advance = useAdvanceJob();
  const complete = useCompleteJob();
  const truck = useTruckLocation();
  const asking = useRef(false);
  const [reason, setReason] = useState<DriverCancelReason>();
  const [reasonMissing, setReasonMissing] = useState(false);
  const [conflict, setConflict] = useState(false);
  // Kept from the `complete` response: the job is gone from `GET /driver/job` once it ends.
  const [finished, setFinished] = useState<TowRequest>();

  if (finished) return <Summary request={finished} />;

  if (!job.data) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: t.jobTitle }} />
        {job.isPending ? (
          <>
            <ActivityIndicator color={theme.brand} />
            <Text style={{ color: theme.textMuted }}>{t.jobLoading}</Text>
          </>
        ) : (
          <>
            <Text style={{ color: theme.textMuted }}>
              {job.isError ? t.jobLoadFailed : t.noJob}
            </Text>
            <Button title={t.backToHome} kind="link" onPress={goHome} />
          </>
        )}
      </View>
    );
  }

  const { id, customer, pickup, dropoff } = job.data;
  const stage: TripStage = job.data.tripStage ?? 'accepted';
  const next = nextTripStage(stage);
  const busy = advance.isPending || complete.isPending || cancel.isPending;
  // The truck drives to the pickup, then carries the vehicle to the drop-off.
  const markers = [
    stage === 'towing'
      ? { id: 'dropoff', kind: 'dropoff' as const, coordinate: dropoff }
      : { id: 'pickup', kind: 'pickup' as const, coordinate: pickup },
    ...(truck ? [{ id: 'truck', kind: 'truck' as const, coordinate: truck }] : []),
  ];

  const onNext = async () => {
    // One step at a time: the confirmation and the request both count.
    if (asking.current || busy) return;
    setConflict(false);
    if (next) {
      advance.mutate(next as Exclude<TripStage, 'accepted'>, {
        onError: (error) => setConflict(isConflict(error)),
      });
      return;
    }
    asking.current = true;
    const confirmed = await confirmDropoff().finally(() => (asking.current = false));
    if (!confirmed) return;
    complete.mutate(undefined, {
      onSuccess: setFinished,
      onError: (error) => setConflict(isConflict(error)),
    });
  };

  const onCancel = async () => {
    // One confirmation at a time, and none while a request is in flight.
    if (asking.current || busy) return;
    if (!reason) return setReasonMissing(true);
    asking.current = true;
    const confirmed = await confirmCancelJob().finally(() => (asking.current = false));
    if (!confirmed) return;
    cancel.mutate({ requestId: id, reason }, { onSuccess: goHome });
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: t.jobTitle }} />
      <LiveIndicator live={t.live} reconnecting={t.reconnecting} />
      <View style={styles.map}>
        {env.mapboxAccessToken ? (
          <TunisMap
            accessToken={env.mapboxAccessToken}
            center={pickup}
            markers={markers}
            fitToMarkers
          />
        ) : (
          <MissingTokenView />
        )}
      </View>
      {conflict ? <Text style={{ color: theme.warning }}>{t.stageConflict}</Text> : null}
      {(advance.isError || complete.isError) && !conflict ? (
        <Text style={{ color: theme.danger }}>
          {complete.isError ? t.completeFailed : t.stageFailed}
        </Text>
      ) : null}
      <Button
        title={t.nextStep[stage]}
        loading={advance.isPending || complete.isPending}
        disabled={busy}
        onPress={() => void onNext()}
      />
      <Timeline job={job.data} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Text style={[styles.label, { color: theme.textMuted }]}>{t.customerLabel}</Text>
        <Text style={[styles.name, { color: theme.text }]}>{customer.fullName}</Text>
        <Button
          title={t.callCustomer(customer.phone)}
          onPress={() => void Linking.openURL(`tel:+${customer.phone.replace(/\D/g, '')}`)}
        />
      </View>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Place label={t.pickupLabel} address={pickup.address} />
        <Place label={t.dropoffLabel} address={dropoff.address} />
        <Text style={{ color: theme.text }}>
          {requestStrings.vehicleOptions[job.data.vehicleType]} ·{' '}
          {requestStrings.problemOptions[job.data.problemType]}
        </Text>
        {job.data.note ? <Text style={{ color: theme.textMuted }}>{job.data.note}</Text> : null}
        <Text style={{ color: theme.textMuted }}>{t.agreedFare}</Text>
        <Text style={[styles.fare, { color: theme.text }]}>
          {requestStrings.fareAmount(job.data.agreedFare)}
        </Text>
      </View>
      {canDriverCancel(job.data) === 'with_reason' ? (
        <View style={styles.cancel}>
          <ChoiceField
            label={t.cancelReasonLabel}
            wrap
            options={DRIVER_CANCEL_REASONS.map((value) => ({
              value,
              label: t.cancelReasons[value],
            }))}
            value={reason}
            onChange={(value) => {
              setReason(value);
              setReasonMissing(false);
            }}
            error={reasonMissing ? t.cancelReasonRequired : undefined}
          />
          {cancel.isError ? <Text style={{ color: theme.danger }}>{t.cancelJobFailed}</Text> : null}
          <Button
            title={t.cancelJob}
            kind="danger"
            loading={cancel.isPending}
            disabled={busy}
            onPress={() => void onCancel()}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

/** The stages reached so far, with the time of each. */
function Timeline({
  job,
}: {
  job: Pick<TowRequest, 'assignedAt' | 'enRouteAt' | 'arrivedAt' | 'towingAt' | 'completedAt'>;
}) {
  const theme = useTheme();
  const steps = [
    [t.timeline.assigned, job.assignedAt],
    [t.timeline.enRoute, job.enRouteAt],
    [t.timeline.arrived, job.arrivedAt],
    [t.timeline.towing, job.towingAt],
    [t.timeline.completed, job.completedAt],
  ] as const;
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{t.timelineTitle}</Text>
      {steps.map(([label, at]) => (
        <View key={label} style={styles.timelineRow}>
          <Text style={{ color: at ? theme.text : theme.textMuted }}>{label}</Text>
          <Text style={{ color: theme.textMuted }}>{at ? t.time(at) : '–'}</Text>
        </View>
      ))}
    </View>
  );
}

/** What the driver sees after dropping off: the route, the fare and when each step happened. */
function Summary({ request }: { request: TowRequest }) {
  const theme = useTheme();
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: t.summaryTitle }} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Text style={[styles.name, { color: theme.text }]}>{t.summaryHeading}</Text>
        <Place label={t.pickupLabel} address={request.pickup.address} />
        <Place label={t.dropoffLabel} address={request.dropoff.address} />
        <Text style={{ color: theme.textMuted }}>{t.agreedFare}</Text>
        <Text style={[styles.fare, { color: theme.text }]}>
          {requestStrings.fareAmount(request.agreedFare ?? request.proposedFare)}
        </Text>
      </View>
      <Timeline job={request} />
      <Button title={t.backToHome} onPress={goHome} />
    </ScrollView>
  );
}

function Place({ label, address }: { label: string; address: string }) {
  const theme = useTheme();
  return (
    <View>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 16 }}>{address}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  body: { padding: 16, gap: 16 },
  map: { height: 200, borderRadius: 12, overflow: 'hidden' },
  card: { borderRadius: 12, padding: 16, gap: 10 },
  label: { fontSize: 13 },
  name: { fontSize: 20, fontWeight: '600' },
  fare: { fontSize: 22, fontWeight: '700' },
  cancel: { gap: 12, marginTop: 8 },
  timelineRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
