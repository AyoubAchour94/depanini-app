import { disputeInputSchema, type TowRequest } from '@depanini/shared';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ApiError } from '@/api/client';
import { useConfirmPayment, useDisputePayment } from '@/api/towRequests';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

import { useRequestStrings } from './strings';

const NOTE_MAX = 500;

/**
 * Asks the customer whether they paid the driver in cash, or shows what they
 * answered. Answering is optional: nothing else on the summary waits for it.
 * A 409 means it was answered already (here or on another device); the
 * mutations refetch on settle, so the answer then shows instead of the prompt.
 */
export function PaymentPrompt({
  request,
  driverName,
}: {
  request: TowRequest;
  driverName?: string;
}) {
  const t = useRequestStrings();
  const confirm = useConfirmPayment();
  const dispute = useDisputePayment();
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string>();
  const [answered, setAnswered] = useState(false);

  const payment = request.payment;
  if (!payment) return null;

  if (payment.status !== 'driver_confirmed') {
    return (
      <Card>
        <Text
          accessibilityLiveRegion="polite"
          variant="heading"
          tone={payment.status === 'customer_confirmed' ? 'success' : 'warning'}
        >
          {payment.status === 'customer_confirmed' ? t.paymentConfirmed : t.paymentDisputed}
        </Text>
        {answered ? <Text tone="muted">{t.paymentAnswered}</Text> : null}
      </Card>
    );
  }

  const busy = confirm.isPending || dispute.isPending;
  const failed = confirm.isError || dispute.isError;
  const error = confirm.error ?? dispute.error;
  const conflict = failed && error instanceof ApiError && error.status === 409;

  const onError = (e: unknown) => setAnswered(e instanceof ApiError && e.status === 409);

  const onSend = () => {
    const parsed = disputeInputSchema.safeParse({ note });
    if (!parsed.success) return setNoteError(t.disputeNoteRequired);
    setNoteError(undefined);
    dispute.mutate({ id: request.id, note: parsed.data.note }, { onError });
  };

  return (
    <Card>
      <Text variant="heading">{t.payQuestion(payment.amountTnd, driverName)}</Text>
      {reporting ? (
        <>
          <TextField
            label={t.disputeNoteLabel}
            placeholder={t.disputeNotePlaceholder}
            value={note}
            onChangeText={(value) => {
              setNote(value);
              setNoteError(undefined);
            }}
            maxLength={NOTE_MAX}
            multiline
            error={noteError}
          />
          <Text variant="caption" tone="muted" style={styles.counter}>
            {t.disputeCounter(note.length, NOTE_MAX)}
          </Text>
          <Button title={t.sendReport} loading={dispute.isPending} onPress={onSend} />
          <Button
            kind="link"
            title={t.cancelReport}
            disabled={busy}
            onPress={() => setReporting(false)}
          />
        </>
      ) : (
        <>
          <Button
            title={t.paidYes}
            loading={confirm.isPending}
            disabled={busy}
            onPress={() => confirm.mutate(request.id, { onError })}
          />
          <Button
            kind="link"
            title={t.reportProblem}
            disabled={busy}
            onPress={() => setReporting(true)}
          />
        </>
      )}
      {failed ? (
        <Text tone={conflict ? 'warning' : 'danger'}>
          {conflict ? t.paymentAnswered : t.paymentFailed}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  counter: { alignSelf: 'flex-end' },
});
