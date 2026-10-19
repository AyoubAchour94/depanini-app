import type { TowRequest } from '@depanini/shared';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDriverJobs } from '@/api/driver';
import { StatusBadge } from '@/features/request/RequestSummary';
import { formatTnd } from '@/features/trip/money';
import { tripStrings } from '@/features/trip/strings';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { driverStrings as t } from './strings';

/** The jobs the driver has finished or cancelled, newest first. */
export function MyJobsScreen() {
  const theme = useTheme();
  const jobs = useDriverJobs();

  if (jobs.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }
  if (jobs.isError && !jobs.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.message, { color: theme.danger }]}>{t.myJobsFailed}</Text>
        <Button title={t.retry} onPress={() => void jobs.refetch()} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.list}
      data={jobs.data.pages.flatMap((page) => page.items)}
      keyExtractor={(job) => job.id}
      renderItem={({ item }) => <JobRow job={item} />}
      onEndReached={() => {
        if (jobs.hasNextPage && !jobs.isFetchingNextPage) void jobs.fetchNextPage();
      }}
      ListEmptyComponent={
        <Text style={[styles.message, { color: theme.textMuted }]}>{t.myJobsEmpty}</Text>
      }
      ListFooterComponent={
        jobs.isFetchingNextPage ? (
          <ActivityIndicator color={theme.brand} />
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

function JobRow({ job }: { job: TowRequest }) {
  const theme = useTheme();
  const fare = job.status === 'completed' ? (job.agreedFare ?? job.proposedFare) : job.proposedFare;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.viewJob}: ${job.pickup.address}`}
      onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}
      style={[styles.row, { backgroundColor: theme.surface }]}
    >
      <View style={styles.rowHeader}>
        <Text style={{ color: theme.textMuted }}>
          {tripStrings.dateTime(job.completedAt ?? job.createdAt)}
        </Text>
        <StatusBadge status={job.status} />
      </View>
      <Text style={{ color: theme.text }}>{t.route(job.pickup.address, job.dropoff.address)}</Text>
      <View style={styles.rowHeader}>
        <Text style={[styles.fare, { color: theme.text }]}>{formatTnd(fare)}</Text>
        {job.payment ? (
          <Text
            style={{ color: job.payment.status === 'disputed' ? theme.warning : theme.textMuted }}
          >
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
  message: { fontSize: 15, textAlign: 'center' },
  row: { borderRadius: 12, padding: 16, gap: 6 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fare: { fontWeight: '700' },
});
