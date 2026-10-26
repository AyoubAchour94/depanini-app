import type { CustomerOffer, TowRequest } from '@depanini/shared';
import { StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useAcceptOffer, useDeclineOffer, useOffers } from '@/api/towRequests';
import { RatingBadge } from '@/features/trip/RatingBadge';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Divider } from '@/ui/Divider';
import { Num } from '@/ui/Num';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';

import { confirmAccept } from './confirm';
import { useRequestStrings } from './strings';
import { truckTypeLabel } from './truck';

/**
 * What an open request shows first: "Waiting for drivers…" until offers come
 * in, then the drivers' offers in the order the API returns them (lowest fare
 * first). Every offer is compared on the same columns: who (rating and truck),
 * the fare, how far away.
 */
export function OffersList({ request, focused }: { request: TowRequest; focused: boolean }) {
  const t = useRequestStrings();
  const theme = useTheme();
  const offers = useOffers(request.id, { poll: focused });
  const accept = useAcceptOffer();
  const decline = useDeclineOffer();

  const onAccept = async (offer: CustomerOffer) => {
    if (!(await confirmAccept(offer.driver.fullName, offer.fare))) return;
    accept.mutate(offer.id);
  };

  const list = offers.data ?? [];
  const busy = accept.isPending || decline.isPending;
  return (
    <View style={{ gap: theme.space[3] }}>
      <View style={styles.header}>
        <Text variant="title" style={styles.title}>
          {list.length > 0 ? t.offersCount(list.length) : t.waitingForDrivers}
        </Text>
        <Text tone="muted">
          {t.yourFare} <Text variant="bodyStrong">{t.fareAmount(request.proposedFare)}</Text>
        </Text>
      </View>
      <Text tone="muted">{list.length > 0 ? t.offersHint : t.waitingHint}</Text>
      {offers.isError && !offers.data ? <Text tone="danger">{t.offersFailed}</Text> : null}
      {accept.isError ? (
        <Text tone="danger">
          {accept.error instanceof ApiError && accept.error.status === 409
            ? t.offerGone
            : t.acceptFailed}
        </Text>
      ) : null}
      {decline.isError ? <Text tone="danger">{t.declineFailed}</Text> : null}
      {list.map((offer, i) => {
        const higher = offer.fare > request.proposedFare;
        const matches = offer.fare === request.proposedFare;
        return (
          <View key={offer.id} style={{ gap: theme.space[3] }}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.row}>
              <Avatar name={offer.driver.fullName} size={48} />
              <View style={styles.who}>
                <View style={styles.nameRow}>
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
                    {offer.driver.fullName}
                  </Text>
                  {matches ? <Pill tone="success" label={t.yourFare} /> : null}
                  {higher ? <Pill tone="warning" label={t.offerHigher} /> : null}
                </View>
                <View style={styles.meta}>
                  {offer.driver.rating ? (
                    <>
                      <RatingBadge rating={offer.driver.rating} />
                      <Text tone="muted"> · </Text>
                    </>
                  ) : null}
                  <Text tone="muted">{truckTypeLabel(offer.driver.truckType)}</Text>
                </View>
              </View>
              <View style={styles.price}>
                <Num
                  size="small"
                  value={offer.fare}
                  unit="TND"
                  tone={higher ? 'warning' : 'text'}
                />
                <Text variant="caption" tone="muted">
                  {t.offerEta(offer.etaMin)}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <View style={styles.decline}>
                <Button
                  kind="secondary"
                  title={t.decline}
                  disabled={busy}
                  onPress={() => decline.mutate(offer.id)}
                />
              </View>
              <View style={styles.accept}>
                <Button title={t.accept} disabled={busy} onPress={() => void onAccept(offer)} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  who: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  price: { alignItems: 'flex-end', gap: 2 },
  actions: { flexDirection: 'row', gap: 12 },
  decline: { flex: 1 },
  accept: { flex: 2 },
});
