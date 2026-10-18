import { router, Stack, useIsFocused } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCancelJob, useDriverJob } from '@/api/driver';
import { env } from '@/config/env';
import { CenterPin } from '@/features/map/CenterPin';
import { MissingTokenView } from '@/features/map/MapScreen';
import { TunisMap } from '@/features/map/TunisMap';
import { requestStrings } from '@/features/request/strings';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { confirmCancelJob } from './confirm';
import { driverStrings as t } from './strings';

const goHome = () => router.replace('/');

/** The job the driver has taken: who to call, where to go, the agreed fare, and a way out. */
export function JobScreen() {
  const theme = useTheme();
  const focused = useIsFocused();
  const job = useDriverJob({ poll: focused });
  const cancel = useCancelJob();
  const asking = useRef(false);

  if (!job.data) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: t.jobTitle }} />
        {job.isPending ? (
          <>
            <ActivityIndicator color={theme.brand} />
            <Text style={{ color: theme.textMuted }}>{t.jobLoading}</Text>
          </>
        ) : (
          <>
            <Text style={{ color: theme.textMuted }}>
              {job.isError ? t.jobLoadFailed : t.noJob}
            </Text>
            <Button title={t.backToHome} kind="link" onPress={goHome} />
          </>
        )}
      </View>
    );
  }

  const { id, customer, pickup, dropoff } = job.data;
  const onCancel = async () => {
    // One confirmation at a time, and none while the cancel is in flight.
    if (asking.current || cancel.isPending) return;
    asking.current = true;
    const confirmed = await confirmCancelJob().finally(() => (asking.current = false));
    if (!confirmed) return;
    cancel.mutate(id, { onSuccess: goHome });
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: t.jobTitle }} />
      <View style={styles.map}>
        {env.mapboxAccessToken ? (
          <>
            <TunisMap accessToken={env.mapboxAccessToken} center={pickup} />
            <CenterPin />
          </>
        ) : (
          <MissingTokenView />
        )}
      </View>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Text style={[styles.label, { color: theme.textMuted }]}>{t.customerLabel}</Text>
        <Text style={[styles.name, { color: theme.text }]}>{customer.fullName}</Text>
        <Button
          title={t.callCustomer(customer.phone)}
          onPress={() => void Linking.openURL(`tel:+${customer.phone.replace(/\D/g, '')}`)}
        />
      </View>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Place label={t.pickupLabel} address={pickup.address} />
        <Place label={t.dropoffLabel} address={dropoff.address} />
        <Text style={{ color: theme.text }}>
          {requestStrings.vehicleOptions[job.data.vehicleType]} ·{' '}
          {requestStrings.problemOptions[job.data.problemType]}
        </Text>
        {job.data.note ? <Text style={{ color: theme.textMuted }}>{job.data.note}</Text> : null}
        <Text style={{ color: theme.textMuted }}>{t.agreedFare}</Text>
        <Text style={[styles.fare, { color: theme.text }]}>
          {requestStrings.fareAmount(job.data.agreedFare)}
        </Text>
      </View>
      {cancel.isError ? <Text style={{ color: theme.danger }}>{t.cancelJobFailed}</Text> : null}
      <Button
        title={t.cancelJob}
        kind="danger"
        loading={cancel.isPending}
        onPress={() => void onCancel()}
      />
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
  name: { fontSize: 20, fontWeight: '600' },
  fare: { fontSize: 22, fontWeight: '700' },
});
