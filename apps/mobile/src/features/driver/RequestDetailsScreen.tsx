import { router, Stack, useIsFocused } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useActiveOffers, useCachedNearbyRequest, useDriverJob } from '@/api/driver';
import { BackButton } from '@/features/map/controls';
import type { MapMarker } from '@/features/map/map-props';
import { MapScreen } from '@/features/map/MapScreen';
import { shortAddress } from '@/features/places/address';
import { formatRemaining, useCountdown } from '@/features/request/countdown';
import { requestStrings } from '@/features/request/strings';
import { RatingBadge } from '@/features/trip/RatingBadge';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Num } from '@/ui/Num';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';

import { OfferActions, OfferPanel, useOfferDraft } from './OfferPanel';
import { driverStrings as t } from './strings';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Snap points of the sheet: the route, the chips, the stepper and the buttons fit at the first. */
const DETAIL_SNAPS = [610, 'full'] as const;

/**
 * A nearby request in full: the map with the pickup and the drop-off, the
 * route, the customer's fare and what the driver can do about it. The
 * request comes from the nearby list's cache.
 */
export function RequestDetailsScreen({ id }: { id: string }) {
  const theme = useTheme();
  // On a short screen the sheet leaves room for the pins; the rest of the offer is a drag away.
  const { height: windowHeight } = useWindowDimensions();
  const firstSnap = Math.min(DETAIL_SNAPS[0], windowHeight * 0.7);
  const focused = useIsFocused();
  const request = useCachedNearbyRequest(id);
  const offers = useActiveOffers({ poll: focused });
  const job = useDriverJob({ poll: focused });
  const remaining = useCountdown(request?.expiresAt, () => {});
  const offer = offers.data?.find((o) => o.requestId === id);
  const draft = useOfferDraft(id, request);

  // An accepted offer, or any job (our other offers are withdrawn when we get
  // one), moves the driver on to the job.
  const hasJob = offer?.status === 'accepted' || Boolean(job.data);
  useEffect(() => {
    if (hasJob && focused) router.replace('/job');
  }, [hasJob, focused]);

  const markers = useMemo<MapMarker[]>(
    () =>
      request
        ? [
            { id: 'pickup', kind: 'pickup', coordinate: request.pickup },
            { id: 'dropoff', kind: 'dropoff', coordinate: request.dropoff },
          ]
        : [],
    [request],
  );

  if (!request && !offer) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.color.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text tone="muted">{t.notFound}</Text>
        <Button title={t.backToRequests} kind="link" onPress={goBack} />
      </View>
    );
  }

  const offerPanel = (
    <OfferPanel
      request={request}
      offer={offer}
      onOfferElapsed={() => void offers.refetch()}
      draft={draft}
    />
  );
  if (!request) {
    // The request left the list (the customer chose someone or it closed), but our offer is known.
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.color.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.wide}>{offerPanel}</View>
        <Button title={t.backToRequests} kind="link" onPress={goBack} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <MapScreen
        centerPin={false}
        markers={markers}
        fitToMarkers
        fitInsetBottom={firstSnap}
        topStart={<BackButton onPress={goBack} />}
        pill={
          remaining === null ? undefined : <Pill label={t.timeLeft(formatRemaining(remaining))} />
        }
        sheet={{
          snapPoints: [firstSnap, 'full'],
          children: (
            <View style={{ gap: theme.space[4] }}>
              <View style={styles.header}>
                <View style={styles.headerText}>
                  <Text variant="title">
                    {requestStrings.vehicleOptions[request.vehicleType]} ·{' '}
                    {requestStrings.problemOptions[request.problemType]}
                  </Text>
                  <Text tone="muted">{t.towDistance(request.distanceM)}</Text>
                  <RatingBadge rating={request.customer?.rating} />
                </View>
                <View style={styles.fare}>
                  <Text variant="caption" tone="muted">
                    {t.customerFare}
                  </Text>
                  <Num size="display" value={request.proposedFare} unit="TND" />
                </View>
              </View>
              <Text variant="caption" tone="muted">
                {t.fareRange(request.minFare, request.maxFare)}
              </Text>
              <View style={[styles.route, { borderColor: theme.color.line }]}>
                <Place
                  label={t.pickupLabel}
                  address={request.pickup.address}
                  dot={theme.color.map.pickup}
                />
                <Place
                  label={t.dropoffLabel}
                  address={request.dropoff.address}
                  dot={theme.color.map.dropoff}
                  square
                />
              </View>
              {request.note ? <Text tone="muted">{request.note}</Text> : null}
              {offerPanel}
            </View>
          ),
          footer: <OfferActions request={request} offer={offer} draft={draft} />,
        }}
      />
    </>
  );
}

function Place({
  label,
  address,
  dot,
  square,
}: {
  label: string;
  address: string;
  dot: string;
  square?: boolean;
}) {
  return (
    <View style={styles.place}>
      <View style={[styles.marker, { backgroundColor: dot, borderRadius: square ? 2 : 6 }]} />
      <View style={styles.placeText}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="bodyStrong">{shortAddress(address)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  wide: { alignSelf: 'stretch', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  fare: { alignItems: 'flex-end' },
  route: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 14, gap: 12 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  marker: { width: 12, height: 12 },
  placeText: { flex: 1 },
});
