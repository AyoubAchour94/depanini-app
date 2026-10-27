import { type ComponentProps, type ReactNode, useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { env } from '@/config/env';
import { useTheme } from '@/theme/theme';
import { MapSheet } from '@/ui/MapSheet';
import { useTranslation } from '@/i18n';
import { Text } from '@/ui/Text';

import { CenterPin } from './CenterPin';
import type { TunisMapProps } from './map-props';
import { TunisMap } from './TunisMap';

type MapOptions = Partial<Omit<TunisMapProps, 'accessToken'>>;

interface MapScreenProps extends MapOptions {
  /** Drawn over the map and the sheet's siblings (absolutely positioned things, e.g. a locate button). */
  children?: ReactNode;
  /** Floating control at the start of the top row, usually a `RoundButton` (menu or back). */
  topStart?: ReactNode;
  /** Status pill next to it (a `Pill`: "18.4 km · ~32 min", "Live"). */
  pill?: ReactNode;
  /** Floating control at the end of the top row. */
  topEnd?: ReactNode;
  /**
   * The draggable bottom sheet: the `MapSheet` props (`children`, `footer`,
   * `snapPoints`, `index`, ...).
   */
  sheet?: ComponentProps<typeof MapSheet>;
  /** The fixed pin over the middle of the map. Default: on, unless there are `markers`. */
  centerPin?: boolean;
}

/**
 * The map-first shell shared by both variants: a full-bleed map (light or
 * dark with the theme), a top row of floating controls and a status pill, and
 * a draggable bottom sheet. `children` are drawn over everything else.
 */
export function MapScreen({
  children,
  topStart,
  pill,
  topEnd,
  sheet,
  centerPin,
  ...mapOptions
}: MapScreenProps) {
  const t = useTheme();
  const insets = useContext(SafeAreaInsetsContext);
  const hasTopRow = topStart || pill || topEnd;
  const showPin = centerPin ?? !mapOptions.markers?.length;

  return (
    <View style={styles.fill}>
      {env.mapboxAccessToken ? (
        <>
          <TunisMap accessToken={env.mapboxAccessToken} {...mapOptions} />
          {showPin ? <CenterPin /> : null}
        </>
      ) : (
        <MissingTokenView />
      )}
      <View
        style={[
          styles.overlay,
          { top: (insets?.top ?? 0) + t.space[3], paddingHorizontal: t.space[4], gap: t.space[2] },
        ]}
        pointerEvents="box-none"
      >
        {hasTopRow ? (
          <View style={[styles.row, { gap: t.space[3] }]} pointerEvents="box-none">
            {topStart}
            <View style={styles.pill} pointerEvents="box-none">
              {pill}
            </View>
            {topEnd}
          </View>
        ) : null}
      </View>
      {sheet ? <MapSheet {...sheet} /> : null}
      {children}
    </View>
  );
}

/** Explains a blank map instead of silently rendering nothing. */
export function MissingTokenView() {
  const { t: tr } = useTranslation();
  const t = useTheme();
  return (
    <View style={[styles.fill, styles.center, { backgroundColor: t.color.background }]}>
      <Text variant="title">{tr('map:tokenMissingTitle')}</Text>
      <Text tone="muted" style={styles.body}>
        {tr('map:tokenMissingBody')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { textAlign: 'center', marginTop: 8 },
  overlay: { position: 'absolute', start: 0, end: 0, alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  pill: { flex: 1, alignItems: 'flex-start' },
});
