import type { TowRequest, TowRequestStatus } from '@depanini/shared';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { shortAddress } from '@/features/places/address';
import { useTheme } from '@/theme/theme';
import { Num } from '@/ui/Num';
import { Pill, type PillTone } from '@/ui/Pill';
import { Text } from '@/ui/Text';

import { useRequestStrings } from './strings';

/** The pickup dot and the drop-off square, as on the map. */
export function PlaceMarker({ kind }: { kind: 'pickup' | 'dropoff' }) {
  const theme = useTheme();
  return (
    <View style={styles.marker}>
      <View
        style={[
          kind === 'pickup' ? styles.dot : styles.square,
          { backgroundColor: theme.color.map[kind] },
        ]}
      />
    </View>
  );
}

/** One end of the route: its marker, a small label and the short address. */
export function PlaceRow({
  kind,
  label,
  address,
}: {
  kind: 'pickup' | 'dropoff';
  label: string;
  address: string;
}) {
  return (
    <View style={styles.placeRow}>
      <PlaceMarker kind={kind} />
      <View style={styles.placeText}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="bodyStrong">{shortAddress(address)}</Text>
      </View>
    </View>
  );
}

/** Where the request is, where it goes, what for and (unless `showFare` is off) the fare offered. */
export function RequestSummary({
  request,
  showFare = true,
}: {
  request: TowRequest;
  showFare?: boolean;
}) {
  const t = useRequestStrings();
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[3] }}>
      <PlaceRow kind="pickup" label={t.pickupLabel} address={request.pickup.address} />
      <PlaceRow kind="dropoff" label={t.dropoffPointLabel} address={request.dropoff.address} />
      <Text>
        {t.vehicleAndProblem(
          t.vehicleOptions[request.vehicleType],
          t.problemOptions[request.problemType],
        )}
      </Text>
      {request.note ? <Text tone="muted">{request.note}</Text> : null}
      {showFare ? <Num size="small" value={request.proposedFare} unit="TND" /> : null}
    </View>
  );
}

const pillTone = (status: TowRequestStatus): PillTone =>
  status === 'open' || status === 'assigned' || status === 'completed'
    ? 'success'
    : status === 'expired'
      ? 'warning'
      : 'neutral';

/** The state of a request as a small coloured tag. */
export function StatusBadge({ status }: { status: TowRequestStatus }) {
  const t = useRequestStrings();
  const tone = pillTone(status);
  // A request that ended without a trip stays quiet: muted text on a fill, not a coloured tag.
  if (tone === 'neutral') return <MutedTag>{t.statusLabels[status]}</MutedTag>;
  return <Pill tone={tone} label={t.statusLabels[status]} />;
}

function MutedTag({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.tag, { backgroundColor: theme.color.surface2, borderRadius: theme.radius.xs }]}
    >
      <Text variant="micro" tone="muted">
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  placeText: { flex: 1 },
  marker: { width: 14, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  square: { width: 12, height: 12, borderRadius: 2 },
  tag: { paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
});
