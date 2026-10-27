import type { NearbyRequest, Offer } from '@depanini/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useSendOffer, useWithdrawOffer } from '@/api/driver';
import { formatRemaining, useCountdown } from '@/features/request/countdown';
import { clampFare } from '@/features/request/fare';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { FareStepper } from '@/ui/FareStepper';
import { Text } from '@/ui/Text';

import { useDriverStrings } from './strings';

/** How far above the customer's fare the counter-offer chips go, in dinars. */
const COUNTER_STEPS = [5, 10, 15] as const;

interface OfferPanelProps {
  /** The request, while the nearby list still holds it. */
  request: NearbyRequest | undefined;
  /** The driver's latest offer on this request. */
  offer: Offer | undefined;
  /** The offer ran out of time on the device clock: ask the server. */
  onOfferElapsed: () => void;
  /** What the driver is about to send; from `useOfferDraft`, shared with `OfferActions`. */
  draft: OfferDraft;
}

/**
 * The offer the driver is putting together for a request: the fare (the
 * customer's, until a counter-offer is picked) and the send call. The panel
 * (chips) and the actions (pinned buttons) share it.
 */
export function useOfferDraft(requestId: string, request: NearbyRequest | undefined) {
  const t = useDriverStrings();
  const send = useSendOffer(requestId);
  const [counter, setCounter] = useState<number | null>(null);
  const proposedFare = request?.proposedFare ?? 0;
  const fare = request
    ? clampFare(counter ?? proposedFare, request.minFare, request.maxFare)
    : proposedFare;

  const status = send.error instanceof ApiError ? send.error.status : undefined;
  const failure = !send.isError
    ? null
    : status === 409 || status === 404
      ? t.notFound
      : status === 400
        ? t.fareRejected
        : t.sendFailed;

  return { fare, setCounter, send, failure };
}

export type OfferDraft = ReturnType<typeof useOfferDraft>;

/**
 * What the driver can do about a request: make a counter-offer, or, once an
 * offer is sent, follow it and withdraw it. The Accept and Offer buttons are
 * `OfferActions`, which the screen pins at the bottom.
 */
export function OfferPanel({ request, offer, onOfferElapsed, draft }: OfferPanelProps) {
  const t = useDriverStrings();
  if (offer?.status === 'pending') {
    return <PendingOffer offer={offer} onElapsed={onOfferElapsed} />;
  }
  const endedMessage = {
    rejected: t.offerRejected,
    expired: t.offerExpired,
    withdrawn: t.offerWithdrawn,
    declined: t.offerDeclined,
  } as const;
  const ended = offer && offer.status !== 'accepted' ? endedMessage[offer.status] : null;
  return (
    <View style={styles.stack}>
      {ended ? <Notice text={ended} /> : null}
      {request ? <CounterOffer request={request} draft={draft} /> : null}
    </View>
  );
}

/** Accept at the customer's fare (the big action) or send the counter-offer (secondary). */
export function OfferActions({
  request,
  offer,
  draft,
}: {
  request: NearbyRequest | undefined;
  offer: Offer | undefined;
  draft: OfferDraft;
}) {
  const t = useDriverStrings();
  if (!request || offer?.status === 'pending') return null;
  const { fare, send } = draft;
  return (
    <View style={styles.actions}>
      <View style={styles.secondary}>
        <Button
          kind="secondary"
          size="big"
          title={t.offerFor(fare)}
          loading={send.isPending}
          disabled={fare === request.proposedFare}
          onPress={() => send.mutate(fare)}
        />
      </View>
      <View style={styles.primary}>
        <Button
          size="big"
          title={t.accept(request.proposedFare)}
          loading={send.isPending}
          onPress={() => send.mutate(request.proposedFare)}
        />
      </View>
    </View>
  );
}

function Notice({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.color.surface2 }]}>
      <Text variant="bodyStrong" accessibilityLiveRegion="polite">
        {text}
      </Text>
    </View>
  );
}

function PendingOffer({ offer, onElapsed }: { offer: Offer; onElapsed: () => void }) {
  const t = useDriverStrings();
  const theme = useTheme();
  const withdraw = useWithdrawOffer();
  const remaining = useCountdown(offer.expiresAt, onElapsed);
  return (
    <View style={[styles.card, { backgroundColor: theme.color.surface2 }]}>
      <Text variant="bodyStrong" tone="success">
        {t.offerPending}
      </Text>
      <Text>{t.offerFare(offer.fare)}</Text>
      {remaining === null ? null : (
        <Text tone="muted">{t.offerExpiresIn(formatRemaining(remaining))}</Text>
      )}
      {withdraw.isError ? <Text tone="danger">{t.withdrawFailed}</Text> : null}
      <Button
        title={t.withdraw}
        kind="danger"
        loading={withdraw.isPending}
        onPress={() => withdraw.mutate(offer.id)}
      />
    </View>
  );
}

/** Chips a few dinars above the customer's fare, and a stepper for any other amount. */
function CounterOffer({ request, draft }: { request: NearbyRequest; draft: OfferDraft }) {
  const t = useDriverStrings();
  const { proposedFare, minFare, maxFare } = request;
  const { fare, setCounter, failure } = draft;
  const options = [
    ...new Set(COUNTER_STEPS.map((step) => clampFare(proposedFare + step, minFare, maxFare))),
  ].filter((amount) => amount > proposedFare);
  return (
    <View style={styles.stack}>
      {failure ? (
        <Text accessibilityLiveRegion="polite" tone="danger">
          {failure}
        </Text>
      ) : null}
      <Text variant="label" tone="muted">
        {t.counterOffer}
      </Text>
      <View style={styles.chips}>
        {options.map((amount) => (
          <Chip
            key={amount}
            role="radio"
            label={String(amount)}
            accessibilityLabel={t.counterChip(amount)}
            selected={fare === amount}
            onPress={() => setCounter(amount)}
          />
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {t.otherAmount}
      </Text>
      <FareStepper fare={fare} min={minFare} max={maxFare} onChange={setCounter} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  card: { borderRadius: 14, padding: 16, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', gap: 12 },
  secondary: { flex: 1 },
  primary: { flex: 1.6 },
});
