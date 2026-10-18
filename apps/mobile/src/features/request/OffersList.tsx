import type { CustomerOffer, TowRequest } from '@depanini/shared';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useAcceptOffer, useDeclineOffer, useOffers } from '@/api/towRequests';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { confirmAccept } from './confirm';
import { requestStrings as t } from './strings';
import { truckTypeLabel } from './truck';

/** The drivers' offers on an open request, in the order the API returns them (lowest fare first). */
export function OffersList({ request, focused }: { request: TowRequest; focused: boolean }) {
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
    <View style={styles.list}>
      {list.length > 0 ? (
        <Text style={[styles.heading, { color: theme.text }]}>{t.offersTitle}</Text>
      ) : null}
      {offers.isError && !offers.data ? (
        <Text style={{ color: theme.danger }}>{t.offersFailed}</Text>
      ) : null}
      {accept.isError ? (
        <Text style={{ color: theme.danger }}>
          {accept.error instanceof ApiError && accept.error.status === 409
            ? t.offerGone
            : t.acceptFailed}
        </Text>
      ) : null}
      {decline.isError ? <Text style={{ color: theme.danger }}>{t.declineFailed}</Text> : null}
      {list.map((offer) => {
        const higher = offer.fare > request.proposedFare;
        return (
          <View key={offer.id} style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.row}>
              <Text style={[styles.name, { color: theme.text }]}>{offer.driver.fullName}</Text>
              <Text style={[styles.fare, { color: higher ? theme.warning : theme.text }]}>
                {t.offerFare(offer.fare)}
              </Text>
            </View>
            {higher ? <Text style={{ color: theme.warning }}>{t.offerHigher}</Text> : null}
            <Text style={{ color: theme.textMuted }}>
              {truckTypeLabel(offer.driver.truckType)} · {t.offerEta(offer.etaMin)} ·{' '}
              {t.offerDistance((offer.distanceToPickupM / 1000).toFixed(1))}
            </Text>
            <View style={styles.actions}>
              <Button title={t.accept} disabled={busy} onPress={() => void onAccept(offer)} />
              <Button
                kind="link"
                title={t.decline}
                disabled={busy}
                onPress={() => decline.mutate(offer.id)}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  heading: { fontSize: 16, fontWeight: '600' },
  card: { borderRadius: 12, padding: 16, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600' },
  fare: { fontSize: 18, fontWeight: '700' },
  actions: { gap: 4, marginTop: 6 },
});
