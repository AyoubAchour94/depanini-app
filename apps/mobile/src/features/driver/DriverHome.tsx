import type { NearbyRequest, VerificationStatus } from '@depanini/shared';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';

import { useDriverJob, useNearbyRequests } from '@/api/driver';
import { useVerification } from '@/api/verification';
import { MenuButton, WalletButton } from '@/features/map/controls';
import type { MapMarker } from '@/features/map/map-props';
import { MapScreen } from '@/features/map/MapScreen';
import { shortAddress } from '@/features/places/address';
import { consumeDriverOnboardingDone } from '@/features/profile/onboarding';
import { formatRemaining, useCountdown } from '@/features/request/countdown';
import { useRequestStrings } from '@/features/request/strings';
import { RatingBadge } from '@/features/trip/RatingBadge';
import { useVerificationStrings } from '@/features/verification/strings';
import { REQUEST_CANCELLED_NOTICE } from '@/push/routing';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { DirectionalGlyph } from '@/ui/DirectionalGlyph';
import { Num } from '@/ui/Num';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';

import { useDriverStrings } from './strings';
import { isTestLocationEnabled, setTestLocation, useTestLocation } from './testLocation';
import { useDriverPresence } from './usePresence';

/** Snap points of the home sheet: the title and the first request or two fit at the lowest. */
const HOME_SNAPS = [340, 'full'] as const;

/**
 * The driver app's home: a map with the Online/Offline switch and, while
 * online, the open requests around the driver as pins and as a list in the
 * sheet.
 */
export function DriverHome() {
  const t = useDriverStrings();
  const v = useVerificationStrings();
  const requestStrings = useRequestStrings();
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

  const requests = !job.data && online ? nearby.data : undefined;
  const markers = useMemo<MapMarker[]>(
    () =>
      (requests ?? []).map((request) => ({
        id: request.id,
        kind: 'pickup',
        coordinate: request.pickup,
      })),
    [requests],
  );

  return (
    <MapScreen
      centerPin={false}
      markers={markers}
      fitToMarkers
      fitInsetBottom={HOME_SNAPS[0]}
      topStart={<MenuButton onPress={() => router.push('/account')} />}
      pill={
        <View
          style={[
            styles.onlinePill,
            {
              backgroundColor: theme.color.surface,
              borderRadius: theme.radius.full,
              boxShadow: theme.shadow.float,
              borderWidth: theme.scheme === 'dark' ? 1 : 0,
              borderColor: theme.color.line,
            },
          ]}
        >
          <Text variant="bodyStrong">{online ? t.online : t.offline}</Text>
          <Switch
            accessibilityLabel={t.onlineSwitch}
            value={online && !gated}
            disabled={gated}
            accessibilityState={{ disabled: gated }}
            onValueChange={(next) => (next ? void goOnline() : goOffline())}
            trackColor={{ true: theme.color.success }}
          />
        </View>
      }
      topEnd={<WalletButton label={t.earnings} onPress={() => router.push('/earnings')} />}
      sheet={{
        snapPoints: HOME_SNAPS,
        children: (
          <View style={{ gap: theme.space[3] }}>
            <View style={styles.titleRow}>
              <Text variant="title" style={styles.title}>
                {job.data
                  ? ''
                  : !online
                    ? t.offlineTitle
                    : nearby.data
                      ? t.requestsNearby(nearby.data.length)
                      : ''}
              </Text>
              <Button title={t.myJobs} kind="link" onPress={() => router.push('/jobs')} />
            </View>
            {gated ? (
              <View style={[styles.card, { backgroundColor: theme.color.surface2 }]}>
                <Text variant="heading">{v.homeCardTitle}</Text>
                <Text tone={status === 'rejected' ? 'danger' : 'muted'}>
                  {status === 'rejected'
                    ? v.homeCardStatus.rejected(verification.data?.rejectionReason)
                    : v.homeCardStatus[status]}
                </Text>
                <View style={styles.linkStart}>
                  <Button
                    title={v.homeCardOpen}
                    kind="link"
                    onPress={() => router.push('/verification')}
                  />
                </View>
              </View>
            ) : approvedNotice.visible ? (
              <View style={[styles.card, { backgroundColor: theme.color.surface2 }]}>
                <Text variant="bodyStrong" tone="success">
                  {v.homeApprovedNotice}
                </Text>
                <Button
                  title={v.homeApprovedDismiss}
                  kind="link"
                  onPress={approvedNotice.dismiss}
                />
              </View>
            ) : null}
            {notice === REQUEST_CANCELLED_NOTICE ? (
              <View style={[styles.card, { backgroundColor: theme.color.surface2 }]}>
                <Text>{t.requestCancelledNotice}</Text>
                <Button
                  title={t.dismissNotice}
                  kind="link"
                  onPress={() => router.setParams({ notice: undefined })}
                />
              </View>
            ) : null}
            {isTestLocationEnabled() ? <TestLocationRow /> : null}
            {problem ? (
              <Text variant="caption" tone="danger">
                {problem === 'denied' ? t.locationDenied : t.locationUnavailable}
              </Text>
            ) : null}
            {job.data ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.jobCardAction}
                onPress={() => router.push('/job')}
                style={[styles.card, { backgroundColor: theme.color.surface2 }]}
              >
                <Text tone="muted">{t.jobCard}</Text>
                <Text variant="heading">{job.data.customer.fullName}</Text>
                <Text>
                  {t.route(
                    shortAddress(job.data.pickup.address),
                    shortAddress(job.data.dropoff.address),
                  )}
                </Text>
                <Text variant="figureSmall">{requestStrings.fareAmount(job.data.agreedFare)}</Text>
              </Pressable>
            ) : !online ? (
              <Text tone="muted">{t.offlineState}</Text>
            ) : nearby.data ? (
              <>
                {nearby.isError ? (
                  <Text variant="caption" tone="warning">
                    {t.loadFailed}
                  </Text>
                ) : null}
                {nearby.data.length === 0 ? (
                  <Text tone="muted">{t.empty}</Text>
                ) : (
                  <View>
                    {nearby.data.map((request, i) => (
                      <RequestRow key={request.id} request={request} first={i === 0} />
                    ))}
                  </View>
                )}
              </>
            ) : nearby.isError ? (
              <Text tone="warning">{t.loadFailed}</Text>
            ) : (
              <View style={styles.loading}>
                <ActivityIndicator color={theme.color.brandAccent} />
                <Text tone="muted">{t.loading}</Text>
              </View>
            )}
          </View>
        ),
      }}
    />
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
  const t = useDriverStrings();
  const theme = useTheme();
  const test = useTestLocation();
  return (
    <View style={[styles.card, { backgroundColor: theme.color.surface2 }]}>
      <Text tone="muted">{test ? t.testLocationUsing(test.address) : t.testLocationUsingGps}</Text>
      <View style={styles.testActions}>
        <Button title={t.setOnMap} kind="link" onPress={() => router.push('/test-location')} />
        {test ? (
          <Button title={t.useDeviceGps} kind="link" onPress={() => setTestLocation(null)} />
        ) : null}
      </View>
    </View>
  );
}

function RequestRow({ request, first }: { request: NearbyRequest; first: boolean }) {
  const t = useDriverStrings();
  const requestStrings = useRequestStrings();
  const theme = useTheme();
  // The list refetches and drops expired requests, so there is nothing to do at zero.
  const remaining = useCountdown(request.expiresAt, () => {});
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.viewRequestAt(shortAddress(request.pickup.address))}
      onPress={() => router.push({ pathname: '/job-offer/[id]', params: { id: request.id } })}
      style={[
        styles.row,
        { borderTopColor: theme.color.line, borderTopWidth: first ? 0 : 1, gap: theme.space[3] },
      ]}
    >
      <View style={styles.rowBody}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {t.route(shortAddress(request.pickup.address), shortAddress(request.dropoff.address))}
        </Text>
        <Text variant="caption" tone="muted">
          {t.distanceToPickup(request.distanceToPickupM)}
        </Text>
        <Text variant="caption" tone="muted">
          {requestStrings.vehicleOptions[request.vehicleType]} ·{' '}
          {requestStrings.problemOptions[request.problemType]}
        </Text>
        <View style={styles.meta}>
          <RatingBadge rating={request.customer?.rating} />
          <Text variant="caption" tone="muted">
            {remaining === null ? '' : t.timeLeft(formatRemaining(remaining))}
          </Text>
          {request.myOffer ? <Pill tone="success" label={t.offerSent} /> : null}
        </View>
      </View>
      <Num size="small" value={request.proposedFare} unit="TND" />
      <DirectionalGlyph tone="muted">›</DirectionalGlyph>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  onlinePill: {
    height: 44,
    paddingStart: 16,
    paddingEnd: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1 },
  card: { borderRadius: 14, padding: 16, gap: 6 },
  linkStart: { alignSelf: 'flex-start' },
  testActions: { flexDirection: 'row', gap: 20 },
  loading: { padding: 24, alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowBody: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
