import type { TowRequest } from '@depanini/shared';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useDriverJobs } from '@/api/driver';
import { shortAddress } from '@/features/places/address';
import { useRequestStrings } from '@/features/request/strings';
import { useTripStrings } from '@/features/trip/strings';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Num } from '@/ui/Num';
import { Pill, type PillTone } from '@/ui/Pill';
import { Text } from '@/ui/Text';

import { useDriverStrings } from './strings';

/** The jobs the driver has finished or cancelled, newest first. */
export function MyJobsScreen() {
  const t = useDriverStrings();
  const theme = useTheme();
  const jobs = useDriverJobs();

  if (jobs.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: theme.color.background }]}>
        <ActivityIndicator color={theme.color.brandAccent} />
      </View>
    );
  }
  if (jobs.isError && !jobs.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.color.background }]}>
        <Text tone="danger" style={styles.message}>
          {t.myJobsFailed}
        </Text>
        <Button title={t.retry} onPress={() => void jobs.refetch()} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: theme.color.background }}
      contentContainerStyle={styles.list}
      data={jobs.data.pages.flatMap((page) => page.items)}
      keyExtractor={(job) => job.id}
      renderItem={({ item }) => <JobRow job={item} />}
      onEndReached={() => {
        if (jobs.hasNextPage && !jobs.isFetchingNextPage) void jobs.fetchNextPage();
      }}
      ListEmptyComponent={
        <Text tone="muted" style={styles.message}>
          {t.myJobsEmpty}
        </Text>
      }
      ListFooterComponent={
        jobs.isFetchingNextPage ? (
          <ActivityIndicator color={theme.color.brandAccent} />
        ) : jobs.hasNextPage || jobs.isFetchNextPageError ? (
          <Button
            kind="link"
            title={jobs.isFetchNextPageError ? t.retry : t.loadMore}
            onPress={() => void jobs.fetchNextPage()}
          />
        ) : undefined
      }
    />
  );
}

const STATUS_TONE: Partial<Record<TowRequest['status'], PillTone>> = {
  completed: 'success',
  cancelled: 'danger',
  expired: 'warning',
};

function JobRow({ job }: { job: TowRequest }) {
  const t = useDriverStrings();
  const tripStrings = useTripStrings();
  const requestStrings = useRequestStrings();
  const theme = useTheme();
  const fare = job.status === 'completed' ? (job.agreedFare ?? job.proposedFare) : job.proposedFare;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.viewJobAt(job.pickup.address)}
      onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.color.surface,
          borderRadius: theme.radius.xl,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.between}>
        <Text variant="caption" tone="muted">
          {tripStrings.dateTime(job.completedAt ?? job.createdAt)}
        </Text>
        <Pill
          tone={STATUS_TONE[job.status] ?? 'brand'}
          label={requestStrings.statusLabels[job.status]}
        />
      </View>
      <Text variant="bodyStrong">
        {t.route(shortAddress(job.pickup.address), shortAddress(job.dropoff.address))}
      </Text>
      <View style={styles.between}>
        <Num size="small" value={fare} unit="TND" />
        {job.payment ? (
          <Text variant="caption" tone={job.payment.status === 'disputed' ? 'warning' : 'muted'}>
            {tripStrings.paymentStatus[job.payment.status]}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  message: { textAlign: 'center' },
  row: { padding: 16, gap: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
