import type { TowRequest } from '@depanini/shared';
import { StyleSheet, View } from 'react-native';

import { RateTripCard } from '@/features/trip/RateTripCard';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Divider } from '@/ui/Divider';
import { Num } from '@/ui/Num';
import { PlainScreen } from '@/ui/PlainScreen';
import { Text } from '@/ui/Text';

import { PaymentPrompt } from './PaymentPrompt';
import { PlaceRow } from './RequestSummary';
import { useRequestStrings } from './strings';
import { Timeline } from './TripProgress';

/**
 * What the customer sees once the driver has dropped the vehicle off: the
 * route, the fare agreed, when each step happened and who towed. The active
 * endpoint no longer carries the driver once the trip is over, so the name is
 * the one seen while it was assigned.
 */
export function CompletedSummary({
  request,
  driverName,
  onDone,
}: {
  request: TowRequest;
  driverName?: string;
  onDone: () => void;
}) {
  const t = useRequestStrings();
  return (
    <PlainScreen footer={<Button size="big" title={t.done} onPress={onDone} />}>
      <View style={styles.head}>
        <Text variant="title">{t.completedTitle}</Text>
        <Text tone="muted">{t.completedFare}</Text>
        <Num size="display" value={request.agreedFare ?? request.proposedFare} unit="TND" />
      </View>
      <Card>
        <PlaceRow kind="pickup" label={t.pickupLabel} address={request.pickup.address} />
        <PlaceRow kind="dropoff" label={t.dropoffPointLabel} address={request.dropoff.address} />
        {driverName ? (
          <>
            <Divider />
            <View style={styles.driver}>
              <Avatar name={driverName} size={40} />
              <View>
                <Text variant="caption" tone="muted">
                  {t.driverLabel}
                </Text>
                <Text variant="bodyStrong">{driverName}</Text>
              </View>
            </View>
          </>
        ) : null}
      </Card>
      <PaymentPrompt request={request} driverName={driverName} />
      <RateTripCard side="customer" requestId={request.id} />
      <Timeline request={request} withCompleted />
    </PlainScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 2 },
  driver: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
