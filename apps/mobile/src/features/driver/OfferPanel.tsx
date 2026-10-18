import type { NearbyRequest, Offer } from '@depanini/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useSendOffer, useWithdrawOffer } from '@/api/driver';
import { formatRemaining, useCountdown } from '@/features/request/countdown';
import { clampFare } from '@/features/request/fare';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { FareStepper } from '@/ui/FareStepper';

import { driverStrings as t } from './strings';

interface OfferPanelProps {
  requestId: string;
  /** The request, while the nearby list still holds it. */
  request: NearbyRequest | undefined;
  /** The driver's latest offer on this request. */
  offer: Offer | undefined;
  /** The offer ran out of time on the device clock: ask the server. */
  onOfferElapsed: () => void;
}

const endedMessage = {
  rejected: t.offerRejected,
  expired: t.offerExpired,
  withdrawn: t.offerWithdrawn,
  declined: t.offerDeclined,
} as const;

/**
 * What the driver can do about a request: accept at the customer's fare, make
 * a counter-offer, or, once an offer is sent, follow it and withdraw it.
 */
export function OfferPanel({ requestId, request, offer, onOfferElapsed }: OfferPanelProps) {
  if (offer?.status === 'pending') {
    return <PendingOffer offer={offer} onElapsed={onOfferElapsed} />;
  }
  const ended = offer && offer.status !== 'accepted' ? endedMessage[offer.status] : null;
  return (
    <>
      {ended ? <Notice text={ended} /> : null}
      {request ? <NewOffer requestId={requestId} request={request} /> : null}
    </>
  );
}

function Notice({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: theme.text }]}>
        {text}
      </Text>
    </View>
  );
}

function PendingOffer({ offer, onElapsed }: { offer: Offer; onElapsed: () => void }) {
  const theme = useTheme();
  const withdraw = useWithdrawOffer();
  const remaining = useCountdown(offer.expiresAt, onElapsed);
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Text style={[styles.notice, { color: theme.success }]}>{t.offerPending}</Text>
      <Text style={{ color: theme.text }}>{t.offerFare(offer.fare)}</Text>
      {remaining === null ? null : (
        <Text style={{ color: theme.textMuted }}>
          {t.offerExpiresIn(formatRemaining(remaining))}
        </Text>
      )}
      {withdraw.isError ? <Text style={{ color: theme.danger }}>{t.withdrawFailed}</Text> : null}
      <Button
        title={t.withdraw}
        kind="danger"
        loading={withdraw.isPending}
        onPress={() => withdraw.mutate(offer.id)}
      />
    </View>
  );
}

function NewOffer({ requestId, request }: { requestId: string; request: NearbyRequest }) {
  const theme = useTheme();
  const send = useSendOffer(requestId);
  const { proposedFare, minFare, maxFare } = request;
  const [counter, setCounter] = useState<number | null>(null);
  const fare = clampFare(counter ?? proposedFare, minFare, maxFare);

  const status = send.error instanceof ApiError ? send.error.status : undefined;
  const failure = !send.isError
    ? null
    : status === 409 || status === 404
      ? t.notFound
      : status === 400
        ? t.fareRejected
        : t.sendFailed;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      {failure ? (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
          {failure}
        </Text>
      ) : null}
      <Button
        title={t.acceptFor(proposedFare)}
        loading={send.isPending}
        onPress={() => send.mutate(proposedFare)}
      />
      <Text style={{ color: theme.textMuted }}>{t.counterOffer}</Text>
      <FareStepper fare={fare} min={minFare} max={maxFare} onChange={setCounter} />
      <Button title={t.sendOffer} loading={send.isPending} onPress={() => send.mutate(fare)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 10 },
  notice: { fontSize: 16, fontWeight: '600' },
});
