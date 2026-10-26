import type { TowRequest } from '@depanini/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { HISTORY_KEY, type HistoryPage, useTowRequest } from '@/api/towRequests';
import { TripDetail } from '@/features/trip/TripDetail';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';

import { requestStrings as t } from './strings';

/**
 * One of the customer's past requests. It is read from the history already in
 * the cache; when the list does not hold it (a link, a reload, a cold start),
 * the request is loaded by its id.
 */
export function TripDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const cached = queryClient
    .getQueryData<{ pages: HistoryPage[] }>(HISTORY_KEY)
    ?.pages.flatMap((page) => page.items)
    .find((item: TowRequest) => item.id === id);
  const loaded = useTowRequest(id, { enabled: !cached });
  const request = cached ?? loaded.data;

  if (!request) {
    return (
      <View style={[styles.center, { backgroundColor: theme.color.background }]}>
        {loaded.isError ? (
          <>
            <Text tone="danger" style={styles.message}>
              {t.tripFailed}
            </Text>
            <Button title={t.retry} onPress={() => void loaded.refetch()} />
          </>
        ) : (
          <ActivityIndicator color={theme.color.brandAccent} />
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.color.background }}
      contentContainerStyle={{ padding: theme.space[4], gap: theme.space[4] }}
    >
      <TripDetail request={request} side="customer" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { textAlign: 'center' },
});
