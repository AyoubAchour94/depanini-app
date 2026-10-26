import type { TowRequest } from '@depanini/shared';
import { Linking, StyleSheet, View } from 'react-native';

import { formatPhone } from '@/features/account/phone';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Divider } from '@/ui/Divider';
import { Num } from '@/ui/Num';
import { RoundButton } from '@/ui/RoundButton';
import { Text } from '@/ui/Text';

import { useRequestStrings } from './strings';
import { truckTypeLabel } from './truck';

/**
 * Who is coming: avatar, name, truck and plate, a round Call button (none
 * once completed: the phone and plate are gone then) and the fare agreed,
 * paid in cash to the driver.
 */
export function AssignedDriver({ request }: { request: TowRequest }) {
  const t = useRequestStrings();
  const theme = useTheme();
  const { driver, agreedFare } = request;
  if (!driver) return null;
  return (
    <View style={{ gap: theme.space[3] }}>
      <View style={styles.row}>
        <Avatar name={driver.fullName} size={56} />
        <View style={styles.who}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {driver.fullName}
          </Text>
          <Text tone="muted">{truckTypeLabel(driver.truckType)}</Text>
          {driver.plateNumber ? (
            <View
              style={[
                styles.plate,
                { borderColor: theme.color.plate, borderRadius: theme.radius.xs },
              ]}
            >
              <Text variant="label" style={{ color: theme.color.plate }}>
                {driver.plateNumber}
              </Text>
            </View>
          ) : null}
        </View>
        {driver.phone ? (
          <RoundButton
            tone="brand"
            accessibilityLabel={t.callPhone(formatPhone(driver.phone))}
            onPress={() => void Linking.openURL(`tel:${driver.phone}`)}
          >
            <Text variant="label" tone="onBrand">
              {t.callDriver}
            </Text>
          </RoundButton>
        ) : null}
      </View>
      {agreedFare ? (
        <>
          <Divider />
          <View style={styles.fareRow}>
            <Text tone="muted" style={styles.fareLabel}>
              {t.fareCashLabel}
            </Text>
            <Num size="small" value={agreedFare} unit="TND" />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  who: { flex: 1, gap: 2, alignItems: 'flex-start' },
  plate: { borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 },
  fareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  fareLabel: { flex: 1 },
});
