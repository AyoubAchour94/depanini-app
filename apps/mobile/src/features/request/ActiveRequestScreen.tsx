import {
  canCustomerCancel,
  CUSTOMER_CANCEL_REASONS,
  type CustomerCancelReason,
  type TowRequest,
} from '@depanini/shared';
import { router, useIsFocused } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useActiveTowRequest, useCancelTowRequest } from '@/api/towRequests';
import { BackButton } from '@/features/map/controls';
import { MapScreen } from '@/features/map/MapScreen';
import { useRealtimeStatus } from '@/realtime/status';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ChoiceField } from '@/ui/ChoiceField';
import { Divider } from '@/ui/Divider';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';

import { AssignedDriver } from './AssignedDriver';
import { CompletedSummary } from './CompletedSummary';
import { confirmCancel } from './confirm';
import { formatRemaining, useCountdown } from './countdown';
import { OffersList } from './OffersList';
import { CenterState, PlainScreen } from './PlainScreen';
import { useRequestFlow } from './RequestFlowContext';
import { RequestSummary } from './RequestSummary';
import { requestStrings as t } from './strings';
import { TripStatus, tripMarkers } from './TripProgress';

/** Snap points of the request sheet: the first fits the title, an offer or two and Cancel. */
const SHEET_SNAPS = [440, 'full'] as const;

/**
 * The customer's open request: waiting for drivers, with the time left and a
 * way to cancel. It always reads `GET /tow-requests/active`; when that says
 * there is none any more (expired, or cancelled elsewhere) it shows what was
 * last seen with a way to request again. While it is open or assigned it is a
 * map with the offers, then the live trip, in the sheet.
 */
export function ActiveRequestScreen() {
  const theme = useTheme();
  const focused = useIsFocused();
  const live = useRealtimeStatus() === 'live';
  const { height: windowHeight } = useWindowDimensions();
  const active = useActiveTowRequest({ poll: focused });
  const cancel = useCancelTowRequest();
  const { startFrom } = useRequestFlow();

  // The server forgets a request once it is over, so keep the last one seen to offer "Request again".
  const [lastSeen, setLastSeen] = useState<TowRequest | null>(null);
  if (active.data && active.data !== lastSeen) setLastSeen(active.data);
  // The active endpoint drops the driver once the trip is over; keep the name for the summary.
  const [driverName, setDriverName] = useState<string>();
  const assignedName = active.data?.driver?.fullName;
  if (assignedName && assignedName !== driverName) setDriverName(assignedName);
  const [reason, setReason] = useState<CustomerCancelReason>();
  const [reasonMissing, setReasonMissing] = useState(false);
  const [conflict, setConflict] = useState(false);

  const open = active.data?.status === 'open' ? active.data : null;
  const assigned = active.data?.status === 'assigned' ? active.data : null;
  const completed = active.data?.status === 'completed' ? active.data : null;
  const ended = open || assigned || completed ? null : (active.data ?? lastSeen);
  // The device clock only decides when to ask; the server decides whether it expired.
  const remaining = useCountdown((open ?? ended)?.expiresAt, () => {
    if (open) void active.refetch();
  });

  if (active.isPending) {
    return (
      <CenterState>
        <ActivityIndicator color={theme.color.brandAccent} />
        <Text tone="muted">{t.loadingRequest}</Text>
      </CenterState>
    );
  }
  if (active.isError && !active.data && !lastSeen) {
    return (
      <CenterState>
        <Text tone="danger" style={styles.message}>
          {t.loadFailed}
        </Text>
        <Button title={t.retry} onPress={() => void active.refetch()} />
      </CenterState>
    );
  }

  const goHome = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (completed) {
    return <CompletedSummary request={completed} driverName={driverName} onDone={goHome} />;
  }

  const current = open ?? assigned;
  if (current) {
    const rule = canCustomerCancel(current);
    const onCancel = async () => {
      if (rule === 'with_reason' && !reason) return setReasonMissing(true);
      if (!(await confirmCancel())) return;
      setConflict(false);
      // A 404 or 409 means it is already over (or moved on); the refetch then shows how.
      cancel.mutate(
        { id: current.id, reason: rule === 'with_reason' ? reason : undefined },
        {
          onSuccess: goHome,
          onError: (error) => setConflict(error instanceof ApiError && error.status === 409),
        },
      );
    };
    const sheetTop = Math.min(SHEET_SNAPS[0], windowHeight * 0.6);
    const pillLabel = open
      ? `${live ? t.live : t.reconnecting} · ${
          remaining === 0 ? t.expiring : t.timeLeft(formatRemaining(remaining ?? 0))
        }`
      : t.assignedTitle;
    return (
      <MapScreen
        center={current.pickup}
        markers={
          open
            ? [
                { id: 'pickup', kind: 'pickup', coordinate: open.pickup },
                { id: 'dropoff', kind: 'dropoff', coordinate: open.dropoff },
              ]
            : tripMarkers(current)
        }
        fitToMarkers
        fitInsetBottom={sheetTop}
        topStart={<BackButton onPress={goHome} />}
        pill={
          <View accessibilityLiveRegion="polite">
            <Pill dot={live} label={pillLabel} />
          </View>
        }
        sheet={{
          snapPoints: SHEET_SNAPS,
          scrollResetKey: open ? 'offers' : 'trip',
          children: (
            <View style={{ gap: theme.space[4] }}>
              {open ? (
                <OffersList request={open} focused={focused} />
              ) : (
                <>
                  <TripStatus request={current} />
                  <Divider />
                  <AssignedDriver request={current} />
                </>
              )}
              <Divider />
              <RequestSummary request={current} showFare={false} />
              {rule === 'with_reason' ? (
                <ChoiceField
                  label={t.cancelReasonLabel}
                  wrap
                  options={CUSTOMER_CANCEL_REASONS.map((value) => ({
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
              ) : null}
            </View>
          ),
          footer: (
            <View style={{ gap: theme.space[2] }}>
              {conflict ? <Text tone="warning">{t.cancelConflict}</Text> : null}
              {cancel.isError && !conflict ? <Text tone="danger">{t.cancelFailed}</Text> : null}
              {rule === 'no' ? (
                <Text tone="muted">{t.cancelUnavailable}</Text>
              ) : (
                <CancelAction
                  disabled={cancel.isPending || (open ? remaining === 0 : false)}
                  onPress={() => void onCancel()}
                />
              )}
            </View>
          ),
        }}
      />
    );
  }

  if (!ended) {
    return (
      <CenterState>
        <Text variant="title">{t.noActiveTitle}</Text>
        <Button title={t.backHome} onPress={goHome} />
      </CenterState>
    );
  }

  const expired = ended.status === 'expired' || remaining === 0;
  return (
    <PlainScreen
      footer={
        <>
          <Button
            size="big"
            title={t.requestAgain}
            onPress={() => {
              startFrom(ended);
              // Same places, vehicle and problem; the fare step is next, with a fresh estimate.
              router.push('/request/fare');
            }}
          />
          <Button kind="link" title={t.backHome} onPress={goHome} />
        </>
      }
    >
      <Text variant="title">{expired ? t.expiredTitle : t.cancelledTitle}</Text>
      <Card>
        <RequestSummary request={ended} />
      </Card>
    </PlainScreen>
  );
}

/** "Cancel request": plain danger text under the offers, so it never competes with Accept. */
function CancelAction({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.cancelRequest}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={[styles.cancel, { opacity: disabled ? 0.5 : 1 }]}
    >
      <Text variant="bodyStrong" tone="danger">
        {t.cancelRequest}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  message: { textAlign: 'center' },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
