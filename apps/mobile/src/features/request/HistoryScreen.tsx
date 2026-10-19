import type { TowRequest } from '@depanini/shared';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTowRequestHistory } from '@/api/towRequests';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { StatusBadge } from './RequestSummary';
import { requestStrings as t } from './strings';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Every request the customer has made, newest first. */
export function HistoryScreen() {
  const theme = useTheme();
  const history = useTowRequestHistory();

  if (history.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }
  if (history.isError && !history.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.message, { color: theme.danger }]}>{t.historyFailed}</Text>
        <Button title={t.retry} onPress={() => void history.refetch()} />
      </View>
    );
  }

  const requests = history.data.pages.flatMap((page) => page.items);
  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.list}
      data={requests}
      keyExtractor={(request) => request.id}
      renderItem={({ item }) => <HistoryRow request={item} />}
      onEndReached={() => {
        if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
      }}
      ListEmptyComponent={
        <Text style={[styles.message, { color: theme.textMuted }]}>{t.historyEmpty}</Text>
      }
      ListFooterComponent={
        history.isFetchingNextPage ? (
          <ActivityIndicator color={theme.brand} />
        ) : history.hasNextPage || history.isFetchNextPageError ? (
          <Button
            kind="link"
            title={history.isFetchNextPageError ? t.retry : t.loadMore}
            onPress={() => void history.fetchNextPage()}
          />
        ) : undefined
      }
    />
  );
}

function HistoryRow({ request }: { request: TowRequest }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/request/trip/[id]', params: { id: request.id } })}
      style={[styles.row, { backgroundColor: theme.surface }]}
    >
      <View style={styles.rowHeader}>
        <Text style={{ color: theme.textMuted }}>{formatDate(request.createdAt)}</Text>
        <StatusBadge status={request.status} />
      </View>
      <Text style={{ color: theme.text }}>
        {t.routeSummary(request.pickup.address, request.dropoff.address)}
      </Text>
      <Text style={[styles.fare, { color: theme.text }]}>
        {t.fareAmount(
          request.status === 'completed'
            ? (request.agreedFare ?? request.proposedFare)
            : request.proposedFare,
        )}
      </Text>
      {request.status === 'completed' && request.payment ? (
        <Text
          style={{ color: request.payment.status === 'disputed' ? theme.warning : theme.textMuted }}
        >
          {t.paymentStatus[request.payment.status]}
        </Text>
      ) : null}
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
