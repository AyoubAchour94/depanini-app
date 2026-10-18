import type { TowRequest } from '@depanini/shared';
import { router, useIsFocused } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useActiveTowRequest, useCancelTowRequest } from '@/api/towRequests';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { confirmCancel } from './confirm';
import { formatRemaining, useCountdown } from './countdown';
import { useRequestFlow } from './RequestFlowContext';
import { RequestSummary } from './RequestSummary';
import { requestStrings as t } from './strings';

/**
 * The customer's open request: waiting for drivers, with the time left and a
 * way to cancel. It always reads `GET /tow-requests/active`; when that says
 * there is none any more (expired, or cancelled elsewhere) it shows what was
 * last seen with a way to request again.
 */
export function ActiveRequestScreen() {
  const theme = useTheme();
  const active = useActiveTowRequest({ poll: useIsFocused() });
  const cancel = useCancelTowRequest();
  const { startFrom } = useRequestFlow();

  // The server forgets a request once it is over, so keep the last one seen to offer "Request again".
  const [lastSeen, setLastSeen] = useState<TowRequest | null>(null);
  if (active.data && active.data !== lastSeen) setLastSeen(active.data);

  const open = active.data?.status === 'open' ? active.data : null;
  const ended = open ? null : (active.data ?? lastSeen);
  // The device clock only decides when to ask; the server decides whether it expired.
  const remaining = useCountdown((open ?? ended)?.expiresAt, () => {
    if (open) void active.refetch();
  });

  if (active.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.brand} />
        <Text style={{ color: theme.textMuted }}>{t.loadingRequest}</Text>
      </View>
    );
  }
  if (active.isError && !active.data && !lastSeen) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.message, { color: theme.danger }]}>{t.loadFailed}</Text>
        <Button title={t.retry} onPress={() => void active.refetch()} />
      </View>
    );
  }

  const goHome = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (open) {
    const onCancel = async () => {
      if (!(await confirmCancel())) return;
      // A 404 or 409 means it is already over; the refetch then shows how.
      cancel.mutate(open.id, { onSuccess: goHome });
    };
    return (
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
      >
        <Text style={[styles.title, { color: theme.text }]}>{t.waitingForDrivers}</Text>
        <Text accessibilityLiveRegion="polite" style={{ color: theme.textMuted }}>
          {remaining === 0 ? t.expiring : `${t.expiresIn} ${formatRemaining(remaining ?? 0)}`}
        </Text>
        <RequestSummary request={open} />
        {cancel.isError ? <Text style={{ color: theme.danger }}>{t.cancelFailed}</Text> : null}
        <Button
          kind="danger"
          title={t.cancelRequest}
          loading={cancel.isPending}
          disabled={remaining === 0}
          onPress={() => void onCancel()}
        />
      </ScrollView>
    );
  }

  if (!ended) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>{t.noActiveTitle}</Text>
        <Button title={t.backHome} onPress={goHome} />
      </View>
    );
  }

  const expired = ended.status === 'expired' || remaining === 0;
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: theme.text }]}>
        {expired ? t.expiredTitle : t.cancelledTitle}
      </Text>
      <RequestSummary request={ended} />
      <Button
        title={t.requestAgain}
        onPress={() => {
          startFrom(ended);
          // Same places, vehicle and problem; the fare step is next, with a fresh estimate.
          router.push('/request/fare');
        }}
      />
      <Button kind="link" title={t.backHome} onPress={goHome} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  content: { padding: 16, gap: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  message: { fontSize: 14, textAlign: 'center' },
});
