import { router, useIsFocused } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useActiveTowRequest } from '@/api/towRequests';
import { MapScreen } from '@/features/map/MapScreen';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { useRequestFlow } from './RequestFlowContext';
import { StatusBadge } from './RequestSummary';
import { requestStrings as t } from './strings';

/**
 * The customer app's home: the map, and the way into a tow request, or into
 * the open request when there already is one (a customer has one at a time).
 */
export function CustomerHome() {
  const theme = useTheme();
  const { reset } = useRequestFlow();
  const active = useActiveTowRequest({ poll: useIsFocused() });
  const open =
    active.data?.status === 'open' || active.data?.status === 'assigned' ? active.data : null;

  return (
    <MapScreen>
      <View style={styles.action}>
        {open ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.viewRequest}
            onPress={() => router.push({ pathname: '/request/active', params: { id: open.id } })}
            style={[styles.card, { backgroundColor: theme.surface }]}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                {open.status === 'assigned' ? t.assignedCardTitle : t.activeCardTitle}
              </Text>
              <StatusBadge status={open.status} />
            </View>
            <Text style={{ color: theme.textMuted }}>
              {t.routeSummary(open.pickup.address, open.dropoff.address)}
            </Text>
            <Text style={{ color: theme.color.brandText, fontWeight: '600' }}>{t.viewRequest}</Text>
          </Pressable>
        ) : (
          <Button
            title={t.requestTow}
            onPress={() => {
              // Every request starts from scratch.
              reset();
              router.push('/request/pickup');
            }}
          />
        )}
      </View>
    </MapScreen>
  );
}

const styles = StyleSheet.create({
  action: { position: 'absolute', left: 16, right: 16, bottom: 24 },
  card: { borderRadius: 12, padding: 16, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
});
