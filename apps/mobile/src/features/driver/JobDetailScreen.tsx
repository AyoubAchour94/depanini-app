import type { TowRequest } from '@depanini/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { JOBS_KEY } from '@/api/driver';
import type { HistoryPage } from '@/api/towRequests';
import { RateTripCard } from '@/features/trip/RateTripCard';
import { ReceiptCard, TripDetail } from '@/features/trip/TripDetail';
import { useTheme } from '@/theme/theme';

import { useDriverStrings } from './strings';

/**
 * One finished or cancelled job. It is read from the jobs list already in the
 * cache; when the list does not hold it (a link, a cold start), only the
 * receipt is fetched.
 */
export function JobDetailScreen() {
  const t = useDriverStrings();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const job = queryClient
    .getQueryData<{ pages: HistoryPage[] }>(JOBS_KEY)
    ?.pages.flatMap((page) => page.items)
    .find((item: TowRequest) => item.id === id);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: t.jobDetailTitle }} />
      {job ? (
        <TripDetail request={job} side="driver" />
      ) : (
        <>
          <RateTripCard side="driver" requestId={id} />
          <ReceiptCard requestId={id} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16 },
});
