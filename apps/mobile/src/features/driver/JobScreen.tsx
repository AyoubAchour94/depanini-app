import {
  canDriverCancel,
  DRIVER_CANCEL_REASONS,
  type DriverCancelReason,
  haversineM,
  nextTripStage,
  type TowRequest,
  type TripStage,
} from '@depanini/shared';
import { router, Stack, useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { useAdvanceJob, useCancelJob, useCompleteJob, useDriverJob } from '@/api/driver';
import { MapScreen } from '@/features/map/MapScreen';
import { requestStrings } from '@/features/request/strings';
import { RateTripCard } from '@/features/trip/RateTripCard';
import { LiveIndicator } from '@/realtime/LiveIndicator';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ChoiceField } from '@/ui/ChoiceField';
import { Divider } from '@/ui/Divider';
import { Num } from '@/ui/Num';
import { Pill } from '@/ui/Pill';
import { RoundButton } from '@/ui/RoundButton';
import { StageBar } from '@/ui/StageBar';
import { Text } from '@/ui/Text';

import { confirmCancelJob, confirmDropoff } from './confirm';
import { NavBanner } from './NavBanner';
import { driverStrings as t } from './strings';
import { useTruckLocation } from './usePresence';

const goHome = () => router.replace('/');

const isConflict = (error: unknown) => error instanceof ApiError && error.status === 409;

/** The stages the stage bar walks through (the last segment, "Done", is the summary). */
const STAGE_ORDER: readonly TripStage[] = ['accepted', 'en_route', 'arrived', 'towing'];

/**
 * The job the driver has taken, on the map: a navigation banner on top, and a
 * sheet with the stage bar, the customer, the stops, the cash to collect and
 * the one next action pinned at the bottom. After the drop-off it shows the summary.
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
      <View style={[styles.fill, styles.center, { backgroundColor: theme.color.background }]}>
        <Stack.Screen options={{ title: t.jobTitle }} />
        {job.isPending ? (
          <>
            <ActivityIndicator color={theme.color.brandAccent} />
            <Text tone="muted">{t.jobLoading}</Text>
          </>
        ) : (
          <>
            <Text tone="muted">{job.isError ? t.jobLoadFailed : t.noJob}</Text>
            <Button title={t.backToHome} kind="link" onPress={goHome} />
          </>
        )}
      </View>
    );
  }

  const { id, customer, pickup, dropoff, agreedFare } = job.data;
  const stage: TripStage = job.data.tripStage ?? 'accepted';
  const next = nextTripStage(stage);
  const busy = advance.isPending || complete.isPending || cancel.isPending;
  // The truck drives to the pickup, then carries the vehicle to the drop-off.
  const target = stage === 'towing' ? dropoff : pickup;
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
    const confirmed = await confirmDropoff(agreedFare).finally(() => (asking.current = false));
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
    <MapScreen
      center={pickup}
      markers={markers}
      fitToMarkers
      pill={
        <NavBanner
          title={stage === 'towing' ? t.dropoffLabel : t.pickupLabel}
          target={t.navTarget[stage]}
          address={target.address}
          distance={truck ? t.navDistance(haversineM(truck, target)) : undefined}
        />
      }
      sheet={{
        snapPoints: ['68%', 'full'],
        footer: (
          <View style={{ gap: theme.space[2] }}>
            {conflict ? (
              <Text variant="caption" tone="warning">
                {t.stageConflict}
              </Text>
            ) : null}
            {(advance.isError || complete.isError) && !conflict ? (
              <Text variant="caption" tone="danger">
                {complete.isError ? t.completeFailed : t.stageFailed}
              </Text>
            ) : null}
            <Button
              title={next ? t.nextStep[stage] : t.droppedOffCash(agreedFare)}
              size="big"
              loading={advance.isPending || complete.isPending}
              disabled={busy}
              onPress={() => void onNext()}
            />
          </View>
        ),
        children: (
          <View>
            <Stack.Screen options={{ title: t.jobTitle, headerShown: false }} />
            <LiveIndicator live={t.live} reconnecting={t.reconnecting} />
            <View style={{ marginTop: theme.space[2] }}>
              <StageBar stages={t.stageBar} current={STAGE_ORDER.indexOf(stage)} />
            </View>
            <Divider />
            <View style={styles.row}>
              <Avatar name={customer.fullName} />
              <View style={styles.fill}>
                <Text variant="heading">{customer.fullName}</Text>
                <Text variant="caption" tone="muted">
                  {requestStrings.vehicleOptions[job.data.vehicleType]} ·{' '}
                  {requestStrings.problemOptions[job.data.problemType]}
                </Text>
              </View>
              <RoundButton
                tone="field"
                accessibilityLabel={t.callCustomer(customer.fullName)}
                onPress={() => void Linking.openURL(`tel:+${customer.phone.replace(/\D/g, '')}`)}
              >
                <Text variant="label" tone="brand">
                  {t.call}
                </Text>
              </RoundButton>
            </View>
            <Divider />
            <Stops pickup={pickup.address} dropoff={dropoff.address} />
            {job.data.note ? (
              <Text variant="caption" tone="muted" style={{ marginTop: theme.space[2] }}>
                {job.data.note}
              </Text>
            ) : null}
            <View style={[styles.between, { marginTop: theme.space[3] }]}>
              <Text tone="muted">{t.collectInCash}</Text>
              <Num size="small" value={agreedFare} unit="TND" />
            </View>
            <Divider />
            <Timeline job={job.data} />
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
                {cancel.isError ? (
                  <Text variant="caption" tone="danger">
                    {t.cancelJobFailed}
                  </Text>
                ) : null}
                <Button
                  title={t.cancelJob}
                  kind="danger"
                  loading={cancel.isPending}
                  disabled={busy}
                  onPress={() => void onCancel()}
                />
              </View>
            ) : null}
          </View>
        ),
      }}
    />
  );
}

/** The stages reached so far, with the time of each. */
function Timeline({
  job,
}: {
  job: Pick<TowRequest, 'assignedAt' | 'enRouteAt' | 'arrivedAt' | 'towingAt' | 'completedAt'>;
}) {
  const steps = [
    [t.timeline.assigned, job.assignedAt],
    [t.timeline.enRoute, job.enRouteAt],
    [t.timeline.arrived, job.arrivedAt],
    [t.timeline.towing, job.towingAt],
    [t.timeline.completed, job.completedAt],
  ] as const;
  return (
    <View style={styles.timeline}>
      <Text variant="label" tone="muted">
        {t.timelineTitle}
      </Text>
      {steps.map(([label, at]) => (
        <View key={label} style={styles.between}>
          <Text tone={at ? 'text' : 'muted'}>{label}</Text>
          <Text tone="muted" style={styles.tabular}>
            {at ? t.time(at) : '–'}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** What the driver sees after dropping off: the cash taken, the route, the receipt and when each step happened. */
export function Summary({ request }: { request: TowRequest }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const card = { backgroundColor: theme.color.surface, borderRadius: theme.radius.xl };
  return (
    <View style={[styles.fill, { backgroundColor: theme.color.background }]}>
      <Stack.Screen options={{ title: t.summaryTitle }} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.card, card]}>
          <Pill tone="success" label={t.cashReceived} />
          <Text variant="title">{t.summaryHeading}</Text>
          <Num size="display" value={request.agreedFare ?? request.proposedFare} unit="TND" />
          <Divider />
          <Stops pickup={request.pickup.address} dropoff={request.dropoff.address} />
          {request.payment ? (
            <>
              <Divider />
              <View style={styles.between}>
                <Text tone="muted">{t.receiptNo}</Text>
                <Text variant="bodyStrong" style={styles.tabular}>
                  {request.payment.receiptNo}
                </Text>
              </View>
            </>
          ) : null}
        </View>
        <RateTripCard side="driver" requestId={request.id} />
        <View style={[styles.card, card]}>
          <Timeline job={request} />
        </View>
      </ScrollView>
      <View
        style={[
          styles.pinned,
          {
            backgroundColor: theme.color.surface,
            borderTopColor: theme.color.line,
            paddingBottom: Math.max(insets.bottom, theme.space[4]),
          },
        ]}
      >
        <Button title={t.backToHome} size="big" onPress={goHome} />
      </View>
    </View>
  );
}

/** Pickup and drop-off as two stops joined by a line: a round dot, then a square. */
function Stops({ pickup, dropoff }: { pickup: string; dropoff: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View
          style={[
            styles.dot,
            { backgroundColor: theme.color.brandAccent, borderRadius: theme.radius.full },
          ]}
        />
        <View style={[styles.railLine, { backgroundColor: theme.color.line }]} />
        <View style={[styles.dot, { backgroundColor: theme.color.text, borderRadius: 3 }]} />
      </View>
      <View style={styles.fill}>
        <Place label={t.pickupLabel} address={pickup} />
        <View style={{ height: theme.space[3] }} />
        <Place label={t.dropoffLabel} address={dropoff} />
      </View>
    </View>
  );
}

function Place({ label, address }: { label: string; address: string }) {
  return (
    <View>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="bodyStrong">{address}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  body: { padding: 16, gap: 16 },
  card: { padding: 20, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cancel: { gap: 12, marginTop: 16 },
  timeline: { gap: 8 },
  tabular: { fontVariant: ['tabular-nums'] },
  rail: { alignSelf: 'stretch', alignItems: 'center', paddingTop: 20, paddingBottom: 6 },
  railLine: { width: 2, flex: 1, marginVertical: 4 },
  dot: { width: 12, height: 12 },
  pinned: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
});
