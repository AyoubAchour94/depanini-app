import { formatKilometres } from '@/i18n/format';
import type { Receipt, TowRequest } from '@depanini/shared';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useReceipt } from '@/api/receipt';
import { PlaceRow, StatusBadge } from '@/features/request/RequestSummary';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Divider } from '@/ui/Divider';
import { Num } from '@/ui/Num';
import { Text } from '@/ui/Text';

import { formatTnd } from './money';
import { RateTripCard, type RatingSide } from './RateTripCard';
import { ReportProblemCard } from './ReportProblemCard';
import { driverWithTruck, formatReceiptText, vehicleSummary } from './receiptText';
import { shareText } from './share';
import { useTripStrings } from './strings';

/**
 * One trip as either party sees it: the route, the stage times, the fare and,
 * once completed, the receipt with a way to share it. Rendered inside the
 * caller's scroll view.
 */
export function TripDetail({ request, side }: { request: TowRequest; side: RatingSide }) {
  const t = useTripStrings();
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
      <Card>
        <View style={styles.row}>
          <Text variant="caption" tone="muted">
            {t.dateTime(request.completedAt ?? request.createdAt)}
          </Text>
          <StatusBadge status={request.status} />
        </View>
        <PlaceRow kind="pickup" label={t.pickupLabel} address={request.pickup.address} />
        <PlaceRow kind="dropoff" label={t.dropoffLabel} address={request.dropoff.address} />
        <Divider />
        <View style={styles.row}>
          <View>
            <Text variant="caption" tone="muted">
              {t.fareLabel}
            </Text>
            {request.payment ? (
              <Text variant="caption" tone="muted">
                {t.paymentStatus[request.payment.status]}
              </Text>
            ) : null}
          </View>
          <Num size="figure" value={fare} unit="TND" />
        </View>
      </Card>
      <Card style={{ gap: theme.space[2] }}>
        <Text variant="heading">{t.stagesTitle}</Text>
        {stages.map(([label, at]) => (
          <View key={label} style={styles.row}>
            <Text tone={at ? 'text' : 'muted'}>{label}</Text>
            <Text tone="muted" style={styles.time}>
              {at ? t.time(at) : '–'}
            </Text>
          </View>
        ))}
      </Card>
      {completed ? (
        <>
          <RateTripCard side={side} requestId={request.id} />
          <ReceiptCard requestId={request.id} />
        </>
      ) : null}
      <ReportProblemCard request={request} />
    </>
  );
}

/** The receipt of a completed request, fetched from the API, with the Share button. */
export function ReceiptCard({ requestId }: { requestId: string }) {
  const t = useTripStrings();
  const theme = useTheme();
  const receipt = useReceipt(requestId);

  if (receipt.isPending) {
    return (
      <Card style={styles.center}>
        <ActivityIndicator color={theme.color.brandAccent} />
        <Text tone="muted">{t.receiptLoading}</Text>
      </Card>
    );
  }
  if (!receipt.data) {
    const missing = receipt.error instanceof ApiError && receipt.error.status === 404;
    return (
      <Card style={styles.center}>
        <Text tone="danger">{missing ? t.receiptNotFound : t.receiptFailed}</Text>
        {missing ? null : <Button title={t.retry} onPress={() => void receipt.refetch()} />}
      </Card>
    );
  }
  return <ReceiptView receipt={receipt.data} />;
}

export function ReceiptView({ receipt }: { receipt: Receipt }) {
  const t = useTripStrings();
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
    <Card>
      <Text variant="heading">{t.receiptTitle}</Text>
      <Field label={t.receiptNumber} value={receipt.receiptNo} />
      <Field label={t.receiptDate} value={t.dateTime(receipt.completedAt)} />
      <Field label={t.vehicleLabel} value={vehicleSummary(receipt)} />
      <Field label={t.distanceLabel} value={formatKilometres(receipt.distanceM)} />
      <Field label={t.driverLabel} value={driverWithTruck(receipt.driver)} />
      <Field label={t.customerLabel} value={receipt.customer.fullName} />
      <Divider />
      <Field label={t.paidInCash} value={formatTnd(receipt.agreedFare)} strong />
      {note ? (
        <Text tone={note === 'copied' ? 'success' : 'danger'}>
          {note === 'copied' ? t.copied : t.shareFailed}
        </Text>
      ) : null}
      <Button kind="secondary" title={t.share} loading={sharing} onPress={() => void onShare()} />
    </Card>
  );
}

/** A label and its value on one line; the label stays right before the value in the tree. */
function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.field}>
      <Text tone="muted">{label}</Text>
      <Text variant={strong ? 'heading' : 'bodyStrong'} style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontVariant: ['tabular-nums'] },
  field: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 },
  value: { flexShrink: 1 },
});
