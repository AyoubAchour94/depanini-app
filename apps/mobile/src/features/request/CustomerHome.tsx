import { router, useIsFocused } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useActiveTowRequest } from '@/api/towRequests';
import { MenuButton } from '@/features/map/controls';
import { MapScreen } from '@/features/map/MapScreen';
import { shortAddress } from '@/features/places/address';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';

import { useRequestFlow } from './RequestFlowContext';
import { requestStrings as t } from './strings';

/**
 * Snap points of the home sheet: the title, the address field and the pinned
 * action fit at the default point (a few px of slack for a home indicator).
 */
const HOME_SNAPS = [280] as const;

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

  const startRequest = () => {
    // Every request starts from scratch.
    reset();
    router.push('/request/pickup');
  };

  return (
    <MapScreen
      centerPin={false}
      topStart={<MenuButton onPress={() => router.push('/account')} />}
      sheet={{
        snapPoints: HOME_SNAPS,
        children: open ? (
          <View style={{ gap: theme.space[2] }}>
            <View style={styles.titleRow}>
              <Text variant="title" style={styles.title}>
                {open.status === 'assigned' ? t.assignedCardTitle : t.activeCardTitle}
              </Text>
              <Pill tone="success" label={t.statusLabels[open.status]} />
            </View>
            <Text tone="muted">
              {t.routeSummary(
                shortAddress(open.pickup.address),
                shortAddress(open.dropoff.address),
              )}
            </Text>
          </View>
        ) : (
          <View style={{ gap: theme.space[4] }}>
            <Text variant="title">{t.homeTitle}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t.homePickupLabel}: ${t.currentLocation}. ${t.edit}`}
              onPress={startRequest}
              style={[
                styles.field,
                { backgroundColor: theme.color.surface2, borderRadius: theme.radius.md },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: theme.color.brandAccent }]} />
              <Text variant="bodyStrong" style={styles.fieldText}>
                {t.currentLocation}
              </Text>
              <Text variant="bodyStrong" tone="brand">
                {t.edit}
              </Text>
            </Pressable>
          </View>
        ),
        footer: open ? (
          <Button
            size="big"
            title={t.viewRequest}
            onPress={() => router.push({ pathname: '/request/active', params: { id: open.id } })}
          />
        ) : (
          <Button size="big" title={t.requestTow} onPress={startRequest} />
        ),
      }}
    />
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1 },
  field: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fieldText: { flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
