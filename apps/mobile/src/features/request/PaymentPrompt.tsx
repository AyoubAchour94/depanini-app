import { disputeInputSchema, type TowRequest } from '@depanini/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useConfirmPayment, useDisputePayment } from '@/api/towRequests';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';

import { requestStrings as t } from './strings';

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
  const theme = useTheme();
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
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.result,
            { color: payment.status === 'customer_confirmed' ? theme.success : theme.warning },
          ]}
        >
          {payment.status === 'customer_confirmed' ? t.paymentConfirmed : t.paymentDisputed}
        </Text>
        {answered ? <Text style={{ color: theme.textMuted }}>{t.paymentAnswered}</Text> : null}
      </View>
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
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Text style={[styles.question, { color: theme.text }]}>
        {t.payQuestion(payment.amountTnd, driverName)}
      </Text>
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
          <Text style={[styles.counter, { color: theme.textMuted }]}>
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
        <Text style={{ color: conflict ? theme.warning : theme.danger }}>
          {conflict ? t.paymentAnswered : t.paymentFailed}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 12 },
  question: { fontSize: 17, fontWeight: '600' },
  result: { fontSize: 17, fontWeight: '600' },
  counter: { fontSize: 13, textAlign: 'right' },
});
