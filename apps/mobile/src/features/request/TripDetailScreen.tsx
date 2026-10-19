import type { TowRequest } from '@depanini/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { HISTORY_KEY, type HistoryPage } from '@/api/towRequests';
import { RateTripCard } from '@/features/trip/RateTripCard';
import { ReceiptCard, TripDetail } from '@/features/trip/TripDetail';
import { useTheme } from '@/theme/theme';

/**
 * One of the customer's past requests. It is read from the history already in
 * the cache; when the list does not hold it (a link, a cold start), only the
 * receipt is fetched.
 */
export function TripDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const request = queryClient
    .getQueryData<{ pages: HistoryPage[] }>(HISTORY_KEY)
    ?.pages.flatMap((page) => page.items)
    .find((item: TowRequest) => item.id === id);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.body}>
      {request ? (
        <TripDetail request={request} side="customer" />
      ) : (
        <>
          <RateTripCard side="customer" requestId={id} />
          <ReceiptCard requestId={id} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16 },
});
