import type { NearbyRequest, VerificationStatus } from '@depanini/shared';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { useVerification } from '@/api/verification';
import { consumeDriverOnboardingDone } from '@/features/profile/onboarding';
import { formatRemaining, useCountdown } from '@/features/request/countdown';
import { requestStrings } from '@/features/request/strings';
import { RatingBadge } from '@/features/trip/RatingBadge';
import { verificationStrings as v } from '@/features/verification/strings';
import { REQUEST_CANCELLED_NOTICE } from '@/push/routing';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { driverStrings as t } from './strings';
import { isTestLocationEnabled, setTestLocation, useTestLocation } from './testLocation';
import { useDriverPresence } from './usePresence';

/**
 * The driver app's home: the Online/Offline switch and, while online, the
 * open requests around the driver.
 */
export function DriverHome() {
  const theme = useTheme();
  const focused = useIsFocused();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const job = useDriverJob({ poll: focused });
  // The location keeps going (faster) while a job is open, also on the job screen.
  const { online, problem, goOnline, goOffline } = useDriverPresence(
    focused || !!job.data,
    !!job.data,
  );
  const nearby = useNearbyRequests({ enabled: online && !job.data, poll: focused });
  const verification = useVerification({ poll: focused });
  const status = verification.data?.status;
  // Until the state loads the switch stays usable: the API refuses an unapproved driver anyway.
  const gated = status !== undefined && status !== 'approved';
  const approvedNotice = useApprovalNotice(status);

  // Approval was lost (or never given): go offline and show the card.
  useEffect(() => {
    if (gated && online) goOffline();
  }, [gated, online, goOffline]);

  // A driver who just finished the profile is sent to the documents once.
  useEffect(() => {
    // The router is not ready to navigate during the first render. No cleanup: in development
    // effects run twice, and the flag is already used up by the first run.
    if (consumeDriverOnboardingDone()) setTimeout(() => router.push('/verification'), 0);
  }, []);

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <View style={[styles.switchRow, { backgroundColor: theme.surface }]}>
        <Text style={[styles.switchLabel, { color: theme.text }]}>
          {online ? t.online : t.offline}
        </Text>
        <Switch
          accessibilityLabel={t.onlineSwitch}
          value={online && !gated}
          disabled={gated}
          accessibilityState={{ disabled: gated }}
          onValueChange={(next) => (next ? void goOnline() : goOffline())}
          trackColor={{ true: theme.success }}
        />
      </View>
      {gated ? (
        <View style={[styles.verifyCard, { backgroundColor: theme.surface }]}>
          <Text style={[styles.distance, { color: theme.text }]}>{v.homeCardTitle}</Text>
          <Text style={{ color: status === 'rejected' ? theme.danger : theme.textMuted }}>
            {status === 'rejected'
              ? v.homeCardStatus.rejected(verification.data?.rejectionReason)
              : v.homeCardStatus[status]}
          </Text>
          <Button title={v.homeCardOpen} kind="link" onPress={() => router.push('/verification')} />
        </View>
      ) : approvedNotice.visible ? (
        <View style={[styles.verifyCard, { backgroundColor: theme.surface }]}>
          <Text style={{ color: theme.success, fontWeight: '600' }}>{v.homeApprovedNotice}</Text>
          <Button title={v.homeApprovedDismiss} kind="link" onPress={approvedNotice.dismiss} />
        </View>
      ) : null}
      <View style={styles.links}>
        <Button title={t.myJobs} kind="link" onPress={() => router.push('/jobs')} />
        <Button title={t.earnings} kind="link" onPress={() => router.push('/earnings')} />
      </View>
      {notice === REQUEST_CANCELLED_NOTICE ? (
        <View style={[styles.testRow, { backgroundColor: theme.surface }]}>
          <Text style={{ color: theme.text }}>{t.requestCancelledNotice}</Text>
          <Button
            title={t.dismissNotice}
            kind="link"
            onPress={() => router.setParams({ notice: undefined })}
          />
        </View>
      ) : null}
      {isTestLocationEnabled() ? <TestLocationRow /> : null}
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

/**
 * Whether to tell the driver they were approved: only when the approval arrives while the
 * app is open (the push or the verification screen tells them otherwise), and only once.
 */
function useApprovalNotice(status: VerificationStatus | undefined) {
  const previous = useRef(status);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (status === 'approved' && previous.current && previous.current !== 'approved') {
      setVisible(true);
    }
    previous.current = status;
  }, [status]);
  return { visible, dismiss: () => setVisible(false) };
}

/** Dev/test builds: where the driver app thinks the driver is, with a way to change it. */
function TestLocationRow() {
  const theme = useTheme();
  const test = useTestLocation();
  return (
    <View style={[styles.testRow, { backgroundColor: theme.surface }]}>
      <Text style={{ color: theme.textMuted }}>
        {test ? t.testLocationUsing(test.address) : t.testLocationUsingGps}
      </Text>
      <View style={styles.testActions}>
        <Button title={t.setOnMap} kind="link" onPress={() => router.push('/test-location')} />
        {test ? (
          <Button title={t.useDeviceGps} kind="link" onPress={() => setTestLocation(null)} />
        ) : null}
      </View>
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
      <RatingBadge rating={request.customer?.rating} />
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
  links: { flexDirection: 'row', gap: 24, paddingHorizontal: 16, paddingVertical: 12 },
  note: { fontSize: 14, padding: 16 },
  testRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 6 },
  testActions: { flexDirection: 'row', gap: 20 },
  state: { padding: 24, textAlign: 'center' },
  loading: { padding: 24, alignItems: 'center', gap: 12 },
  list: { padding: 16, gap: 12 },
  jobCard: { margin: 16 },
  verifyCard: { borderRadius: 12, marginHorizontal: 16, marginBottom: 4, padding: 16, gap: 6 },
  card: { borderRadius: 12, padding: 16, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  distance: { fontSize: 16, fontWeight: '600' },
  fare: { fontSize: 18, fontWeight: '700' },
});
