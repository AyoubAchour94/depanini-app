import { router, Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCachedNearbyRequest } from '@/api/driver';
import { env } from '@/config/env';
import { CenterPin } from '@/features/map/CenterPin';
import { MissingTokenView } from '@/features/map/MapScreen';
import { TunisMap } from '@/features/map/TunisMap';
import { formatRemaining, useCountdown } from '@/features/request/countdown';
import { requestStrings } from '@/features/request/strings';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { driverStrings as t } from './strings';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * A nearby request in full. The map is centered on the pickup; the drop-off
 * is given as text. The request comes from the nearby list's cache.
 */
export function RequestDetailsScreen({ id }: { id: string }) {
  const theme = useTheme();
  const request = useCachedNearbyRequest(id);
  const remaining = useCountdown(request?.expiresAt, () => {});

  if (!request) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textMuted }}>{t.notFound}</Text>
        <Button title={t.backToRequests} kind="link" onPress={goBack} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: t.detailsTitle }} />
      <View style={styles.map}>
        {env.mapboxAccessToken ? (
          <>
            <TunisMap accessToken={env.mapboxAccessToken} center={request.pickup} />
            <CenterPin />
          </>
        ) : (
          <MissingTokenView />
        )}
      </View>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Place label={t.pickupLabel} address={request.pickup.address} />
        <Place label={t.dropoffLabel} address={request.dropoff.address} />
        <Text style={{ color: theme.textMuted }}>{t.towDistance(request.distanceM)}</Text>
        <Text style={{ color: theme.text }}>
          {requestStrings.vehicleOptions[request.vehicleType]} ·{' '}
          {requestStrings.problemOptions[request.problemType]}
        </Text>
        {request.note ? <Text style={{ color: theme.textMuted }}>{request.note}</Text> : null}
        <Text style={{ color: theme.textMuted }}>{t.customerFare}</Text>
        <Text style={[styles.fare, { color: theme.text }]}>
          {requestStrings.fareAmount(request.proposedFare)}
        </Text>
        <Text style={{ color: theme.textMuted }}>
          {t.fareRange(request.minFare, request.maxFare)}
        </Text>
        {remaining === null ? null : (
          <Text style={{ color: theme.textMuted }}>{t.timeLeft(formatRemaining(remaining))}</Text>
        )}
      </View>
      {/* PLACEHOLDER: the offer actions (accept or counter) land here in #38. */}
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Text style={{ color: theme.textMuted }}>{t.offerActionsPlaceholder}</Text>
      </View>
    </ScrollView>
  );
}

function Place({ label, address }: { label: string; address: string }) {
  const theme = useTheme();
  return (
    <View>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 16 }}>{address}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  body: { padding: 16, gap: 16 },
  map: { height: 200, borderRadius: 12, overflow: 'hidden' },
  card: { borderRadius: 12, padding: 16, gap: 10 },
  label: { fontSize: 13 },
  fare: { fontSize: 22, fontWeight: '700' },
});
