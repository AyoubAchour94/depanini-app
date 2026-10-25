import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme';
import { Text } from '@/ui/Text';

interface NavBannerProps {
  /** Where the driver is heading: "to pickup". */
  /** Shown when the distance is not known yet: "Pickup". */
  title: string;
  target: string;
  address: string;
  /** Straight-line distance to the target, already formatted ("1.2 km"), once the truck's location is known. */
  distance?: string;
}

/** The dark banner at the top of the job screen: how far the next stop is and where it is. */
export function NavBanner({ title, target, address, distance }: NavBannerProps) {
  const t = useTheme();
  const c = t.color;
  return (
    <View
      accessible
      accessibilityRole="header"
      style={[
        styles.banner,
        {
          backgroundColor: c.banner,
          borderColor: c.bannerBorder,
          borderRadius: t.radius.xl,
          boxShadow: t.shadow.float,
        },
      ]}
    >
      <View style={styles.icon}>
        <Text variant="title" style={{ color: c.brandAccent }}>
          {'➤'}
        </Text>
      </View>
      <View style={styles.text}>
        <Text variant="figureSmall" style={{ color: c.onBanner }} numberOfLines={1}>
          {distance ?? title}
        </Text>
        <Text variant="caption" style={{ color: c.onBanner, opacity: 0.8 }} numberOfLines={1}>
          {`${target} · ${address}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
  },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
});
