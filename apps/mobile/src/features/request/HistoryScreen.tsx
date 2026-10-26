import type { TowRequest } from '@depanini/shared';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useTowRequestHistory } from '@/api/towRequests';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Num } from '@/ui/Num';
import { Text } from '@/ui/Text';

import { PlaceMarker, StatusBadge } from './RequestSummary';
import { shortAddress } from '@/features/places/address';
import { requestStrings as t } from './strings';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Every request the customer has made, newest first. */
export function HistoryScreen() {
  const theme = useTheme();
  const history = useTowRequestHistory();

  if (history.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: theme.color.background }]}>
        <ActivityIndicator color={theme.color.brandAccent} />
      </View>
    );
  }
  if (history.isError && !history.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.color.background }]}>
        <Text tone="danger" style={styles.message}>
          {t.historyFailed}
        </Text>
        <Button title={t.retry} onPress={() => void history.refetch()} />
      </View>
    );
  }

  const requests = history.data.pages.flatMap((page) => page.items);
  return (
    <FlatList
      style={{ backgroundColor: theme.color.background }}
      contentContainerStyle={[styles.list, { padding: theme.space[4], gap: theme.space[3] }]}
      data={requests}
      keyExtractor={(request) => request.id}
      renderItem={({ item }) => <HistoryRow request={item} />}
      onEndReached={() => {
        if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
      }}
      ListEmptyComponent={
        <Text tone="muted" style={styles.message}>
          {t.historyEmpty}
        </Text>
      }
      ListFooterComponent={
        history.isFetchingNextPage ? (
          <ActivityIndicator color={theme.color.brandAccent} />
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
  const fare =
    request.status === 'completed'
      ? (request.agreedFare ?? request.proposedFare)
      : request.proposedFare;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/request/trip/[id]', params: { id: request.id } })}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.color.surface,
          borderRadius: theme.radius.xl,
          padding: theme.space[4],
          gap: theme.space[3],
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.rowHeader}>
        <Text variant="caption" tone="muted">
          {formatDate(request.createdAt)}
        </Text>
        <StatusBadge status={request.status} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.route}>
          <View style={styles.place}>
            <PlaceMarker kind="pickup" />
            <Text variant="bodyStrong" numberOfLines={2} style={styles.address}>
              {shortAddress(request.pickup.address)}
            </Text>
          </View>
          <View style={styles.place}>
            <PlaceMarker kind="dropoff" />
            <Text variant="bodyStrong" numberOfLines={2} style={styles.address}>
              {shortAddress(request.dropoff.address)}
            </Text>
          </View>
        </View>
        <Num size="small" value={fare} unit="TND" />
      </View>
      {request.status === 'completed' && request.payment ? (
        <Text variant="caption" tone={request.payment.status === 'disputed' ? 'warning' : 'muted'}>
          {t.paymentStatus[request.payment.status]}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  list: { flexGrow: 1 },
  message: { textAlign: 'center' },
  row: {},
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  route: { flex: 1, gap: 6 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  address: { flex: 1 },
});
