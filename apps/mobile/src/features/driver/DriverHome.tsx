import type { NearbyRequest } from '@depanini/shared';
import { router, useIsFocused } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { useDriverJob, useNearbyRequests } from '@/api/driver';
import { formatRemaining, useCountdown } from '@/features/request/countdown';
import { requestStrings } from '@/features/request/strings';
import { useTheme } from '@/theme/theme';

import { driverStrings as t } from './strings';
import { useDriverPresence } from './usePresence';

/**
 * The driver app's home: the Online/Offline switch and, while online, the
 * open requests around the driver.
 */
export function DriverHome() {
  const theme = useTheme();
  const focused = useIsFocused();
  const { online, problem, goOnline, goOffline } = useDriverPresence(focused);
  const job = useDriverJob({ poll: focused });
  const nearby = useNearbyRequests({ enabled: online && !job.data, poll: focused });

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <View style={[styles.switchRow, { backgroundColor: theme.surface }]}>
        <Text style={[styles.switchLabel, { color: theme.text }]}>
          {online ? t.online : t.offline}
        </Text>
        <Switch
          accessibilityLabel={t.onlineSwitch}
          value={online}
          onValueChange={(next) => (next ? void goOnline() : goOffline())}
          trackColor={{ true: theme.success }}
        />
      </View>
      {problem ? (
        <Text style={[styles.note, { color: theme.danger }]}>
          {problem === 'denied' ? t.locationDenied : t.locationUnavailable}
        </Text>
      ) : null}
      {job.data ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.jobCardAction}
          onPress={() => router.push('/job')}
          style={[styles.card, styles.jobCard, { backgroundColor: theme.surface }]}
        >
          <Text style={{ color: theme.textMuted }}>{t.jobCard}</Text>
          <Text style={[styles.distance, { color: theme.text }]}>{job.data.customer.fullName}</Text>
          <Text style={{ color: theme.text }}>
            {t.route(job.data.pickup.address, job.data.dropoff.address)}
          </Text>
          <Text style={[styles.fare, { color: theme.text }]}>
            {requestStrings.fareAmount(job.data.agreedFare)}
          </Text>
        </Pressable>
      ) : !online ? (
        <Text style={[styles.state, { color: theme.textMuted }]}>{t.offlineState}</Text>
      ) : nearby.data ? (
        <FlatList
          data={nearby.data}
          keyExtractor={(request) => request.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            nearby.isError ? (
              <Text style={[styles.note, { color: theme.warning }]}>{t.loadFailed}</Text>
            ) : undefined
          }
          ListEmptyComponent={
            <Text style={[styles.state, { color: theme.textMuted }]}>{t.empty}</Text>
          }
          renderItem={({ item }) => <RequestRow request={item} />}
        />
      ) : nearby.isError ? (
        <Text style={[styles.state, { color: theme.warning }]}>{t.loadFailed}</Text>
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.brand} />
          <Text style={{ color: theme.textMuted }}>{t.loading}</Text>
        </View>
      )}
    </View>
  );
}

function RequestRow({ request }: { request: NearbyRequest }) {
  const theme = useTheme();
  // The list refetches and drops expired requests, so there is nothing to do at zero.
  const remaining = useCountdown(request.expiresAt, () => {});
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.viewRequest}: ${request.pickup.address}`}
      onPress={() => router.push({ pathname: '/job-offer/[id]', params: { id: request.id } })}
      style={[styles.card, { backgroundColor: theme.surface }]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.distance, { color: theme.text }]}>
          {t.distanceToPickup(request.distanceToPickupM)}
        </Text>
        <Text style={[styles.fare, { color: theme.text }]}>
          {requestStrings.fareAmount(request.proposedFare)}
        </Text>
      </View>
      <Text style={{ color: theme.text }}>
        {t.route(request.pickup.address, request.dropoff.address)}
      </Text>
      <Text style={{ color: theme.textMuted }}>
        {requestStrings.vehicleOptions[request.vehicleType]} ·{' '}
        {requestStrings.problemOptions[request.problemType]}
      </Text>
      <View style={styles.cardHeader}>
        <Text style={{ color: theme.textMuted }}>
          {remaining === null ? '' : t.timeLeft(formatRemaining(remaining))}
        </Text>
        {request.myOffer ? (
          <Text style={{ color: theme.success, fontWeight: '600' }}>{t.offerSent}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  switchLabel: { fontSize: 18, fontWeight: '600' },
  note: { fontSize: 14, padding: 16 },
  state: { padding: 24, textAlign: 'center' },
  loading: { padding: 24, alignItems: 'center', gap: 12 },
  list: { padding: 16, gap: 12 },
  jobCard: { margin: 16 },
  card: { borderRadius: 12, padding: 16, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  distance: { fontSize: 16, fontWeight: '600' },
  fare: { fontSize: 18, fontWeight: '700' },
});
