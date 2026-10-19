import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MapScreen } from '@/features/map/MapScreen';
import { THEME_PREFERENCES, useTheme, useThemeSetting, type ThemePreference } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { RoundButton } from '@/ui/RoundButton';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

const SNAP_NAMES = ['peek', 'half', 'full'];

function isPreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

/**
 * The map-first shell with a sample sheet, dev builds only (`/dev/map`).
 * `?snap=0|1|2` starts at a snap point and `?theme=light|dark|system` sets the
 * appearance, which the round button also cycles.
 */
export function MapKitScreen() {
  const t = useTheme();
  const setting = useThemeSetting();
  const params = useLocalSearchParams<{ snap?: string; theme?: string }>();
  const [index, setIndex] = useState(Number(params.snap) || 0);
  const forced = params.theme;
  const { setPreference } = setting;
  useEffect(() => {
    if (isPreference(forced)) setPreference(forced);
  }, [forced, setPreference]);

  const cycleTheme = () => {
    const next = THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(setting.preference) + 1) % 3]!;
    setPreference(next);
  };

  return (
    <MapScreen
      topStart={
        <RoundButton accessibilityLabel="Appearance" onPress={cycleTheme}>
          <Text variant="heading">◐</Text>
        </RoundButton>
      }
      pill={<Pill label={`${t.scheme} · ${SNAP_NAMES[index] ?? index}`} dot />}
      sheet={{
        index,
        onIndexChange: setIndex,
        footer: <Button title="Request a tow" size="big" onPress={() => {}} />,
        children: (
          <View style={styles.content}>
            <Text variant="title">Where&apos;s your vehicle?</Text>
            <Text tone="muted">3 tow trucks within 5 km · nearest 6 min</Text>
            <TextField label="Pickup" defaultValue="Avenue Habib Bourguiba 42" />
            <View style={styles.row}>
              <Chip label="Home · La Marsa" onPress={() => {}} />
              <Chip label="Garage · Lac 2" onPress={() => {}} />
            </View>
            {Array.from({ length: 8 }, (_, i) => (
              <Text key={i} tone="muted">
                More details {i + 1}: scrolls only at the full snap point.
              </Text>
            ))}
          </View>
        ),
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
