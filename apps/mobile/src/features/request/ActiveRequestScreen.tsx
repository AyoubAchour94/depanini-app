import {
  canCustomerCancel,
  CUSTOMER_CANCEL_REASONS,
  type CustomerCancelReason,
  type TowRequest,
} from '@depanini/shared';
import { router, useIsFocused } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useActiveTowRequest, useCancelTowRequest } from '@/api/towRequests';
import { LiveIndicator } from '@/realtime/LiveIndicator';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceField } from '@/ui/ChoiceField';

import { AssignedDriver } from './AssignedDriver';
import { CompletedSummary } from './CompletedSummary';
import { confirmCancel } from './confirm';
import { formatRemaining, useCountdown } from './countdown';
import { OffersList } from './OffersList';
import { useRequestFlow } from './RequestFlowContext';
import { RequestSummary } from './RequestSummary';
import { requestStrings as t } from './strings';
import { Timeline, TripMap, TripStatus } from './TripProgress';

/**
 * The customer's open request: waiting for drivers, with the time left and a
 * way to cancel. It always reads `GET /tow-requests/active`; when that says
 * there is none any more (expired, or cancelled elsewhere) it shows what was
 * last seen with a way to request again.
 */
export function ActiveRequestScreen() {
  const theme = useTheme();
  const focused = useIsFocused();
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
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.brand} />
        <Text style={{ color: theme.textMuted }}>{t.loadingRequest}</Text>
      </View>
    );
  }
  if (active.isError && !active.data && !lastSeen) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.message, { color: theme.danger }]}>{t.loadFailed}</Text>
        <Button title={t.retry} onPress={() => void active.refetch()} />
      </View>
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
    return (
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
      >
        <LiveIndicator live={t.live} reconnecting={t.reconnecting} />
        {open ? (
          <>
            <Text style={[styles.title, { color: theme.text }]}>{t.waitingForDrivers}</Text>
            <Text accessibilityLiveRegion="polite" style={{ color: theme.textMuted }}>
              {remaining === 0 ? t.expiring : `${t.expiresIn} ${formatRemaining(remaining ?? 0)}`}
            </Text>
            <RequestSummary request={open} />
            <OffersList request={open} focused={focused} />
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: theme.text }]}>{t.assignedTitle}</Text>
            <TripMap request={current} />
            <TripStatus request={current} />
            <Timeline request={current} />
            <AssignedDriver request={current} />
            <RequestSummary request={current} />
          </>
        )}
        {conflict ? <Text style={{ color: theme.warning }}>{t.cancelConflict}</Text> : null}
        {cancel.isError && !conflict ? (
          <Text style={{ color: theme.danger }}>{t.cancelFailed}</Text>
        ) : null}
        {rule === 'no' ? (
          <Text style={{ color: theme.textMuted }}>{t.cancelUnavailable}</Text>
        ) : (
          <>
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
            <Button
              kind="danger"
              title={t.cancelRequest}
              loading={cancel.isPending}
              disabled={open ? remaining === 0 : false}
              onPress={() => void onCancel()}
            />
          </>
        )}
      </ScrollView>
    );
  }

  if (!ended) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>{t.noActiveTitle}</Text>
        <Button title={t.backHome} onPress={goHome} />
      </View>
    );
  }

  const expired = ended.status === 'expired' || remaining === 0;
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: theme.text }]}>
        {expired ? t.expiredTitle : t.cancelledTitle}
      </Text>
      <RequestSummary request={ended} />
      <Button
        title={t.requestAgain}
        onPress={() => {
          startFrom(ended);
          // Same places, vehicle and problem; the fare step is next, with a fresh estimate.
          router.push('/request/fare');
        }}
      />
      <Button kind="link" title={t.backHome} onPress={goHome} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  content: { padding: 16, gap: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  message: { fontSize: 14, textAlign: 'center' },
});
