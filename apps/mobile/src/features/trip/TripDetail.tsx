import type { Receipt, TowRequest } from '@depanini/shared';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useReceipt } from '@/api/receipt';
import { StatusBadge } from '@/features/request/RequestSummary';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { formatTnd } from './money';
import { formatReceiptText, truckLabel, vehicleSummary } from './receiptText';
import { shareText } from './share';
import { tripStrings as t } from './strings';

/**
 * One trip as either party sees it: the route, the stage times, the fare and,
 * once completed, the receipt with a way to share it. Rendered inside the
 * caller's scroll view.
 */
export function TripDetail({ request }: { request: TowRequest }) {
  const theme = useTheme();
  const completed = request.status === 'completed';
  const fare = completed ? (request.agreedFare ?? request.proposedFare) : request.proposedFare;
  const stages = [
    [t.stages.assigned, request.assignedAt],
    [t.stages.enRoute, request.enRouteAt],
    [t.stages.arrived, request.arrivedAt],
    [t.stages.towing, request.towingAt],
    [t.stages.completed, request.completedAt],
  ] as const;
  return (
    <>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <View style={styles.row}>
          <Text style={{ color: theme.textMuted }}>
            {t.dateTime(request.completedAt ?? request.createdAt)}
          </Text>
          <StatusBadge status={request.status} />
        </View>
        <Field label={t.pickupLabel} value={request.pickup.address} />
        <Field label={t.dropoffLabel} value={request.dropoff.address} />
        <Text style={[styles.label, { color: theme.textMuted }]}>{t.fareLabel}</Text>
        <Text style={[styles.fare, { color: theme.text }]}>{formatTnd(fare)}</Text>
        {request.payment ? (
          <Text style={{ color: theme.textMuted }}>{t.paymentStatus[request.payment.status]}</Text>
        ) : null}
      </View>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Text style={[styles.label, { color: theme.textMuted }]}>{t.stagesTitle}</Text>
        {stages.map(([label, at]) => (
          <View key={label} style={styles.row}>
            <Text style={{ color: at ? theme.text : theme.textMuted }}>{label}</Text>
            <Text style={{ color: theme.textMuted }}>{at ? t.time(at) : '–'}</Text>
          </View>
        ))}
      </View>
      {completed ? <ReceiptCard requestId={request.id} /> : null}
    </>
  );
}

/** The receipt of a completed request, fetched from the API, with the Share button. */
export function ReceiptCard({ requestId }: { requestId: string }) {
  const theme = useTheme();
  const receipt = useReceipt(requestId);

  if (receipt.isPending) {
    return (
      <View style={[styles.card, styles.center, { backgroundColor: theme.surface }]}>
        <ActivityIndicator color={theme.brand} />
        <Text style={{ color: theme.textMuted }}>{t.receiptLoading}</Text>
      </View>
    );
  }
  if (!receipt.data) {
    const missing = receipt.error instanceof ApiError && receipt.error.status === 404;
    return (
      <View style={[styles.card, styles.center, { backgroundColor: theme.surface }]}>
        <Text style={{ color: theme.danger }}>{missing ? t.receiptNotFound : t.receiptFailed}</Text>
        {missing ? null : <Button title={t.retry} onPress={() => void receipt.refetch()} />}
      </View>
    );
  }
  return <ReceiptView receipt={receipt.data} />;
}

export function ReceiptView({ receipt }: { receipt: Receipt }) {
  const theme = useTheme();
  const [note, setNote] = useState<'copied' | 'failed'>();
  const [sharing, setSharing] = useState(false);

  const onShare = async () => {
    setNote(undefined);
    setSharing(true);
    try {
      if ((await shareText(formatReceiptText(receipt))) === 'copied') setNote('copied');
    } catch {
      setNote('failed');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Text style={[styles.heading, { color: theme.text }]}>{t.receiptTitle}</Text>
      <Field label={t.receiptNumber} value={receipt.receiptNo} />
      <Field label={t.receiptDate} value={t.dateTime(receipt.completedAt)} />
      <Field label={t.vehicleLabel} value={vehicleSummary(receipt)} />
      <Field label={t.distanceLabel} value={`${(receipt.distanceM / 1000).toFixed(1)} km`} />
      <Field
        label={t.driverLabel}
        value={`${receipt.driver.fullName} (${truckLabel(receipt.driver.truckType)})`}
      />
      <Field label={t.customerLabel} value={receipt.customer.fullName} />
      <Field label={t.paidInCash} value={formatTnd(receipt.agreedFare)} />
      {note ? (
        <Text style={{ color: note === 'copied' ? theme.success : theme.danger }}>
          {note === 'copied' ? t.copied : t.shareFailed}
        </Text>
      ) : null}
      <Button title={t.share} loading={sharing} onPress={() => void onShare()} />
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 16 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 10 },
  center: { alignItems: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13 },
  heading: { fontSize: 18, fontWeight: '600' },
  fare: { fontSize: 22, fontWeight: '700' },
});
