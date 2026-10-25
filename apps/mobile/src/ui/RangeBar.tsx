import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme';

import { Text } from './Text';

/** Where `value` sits between `min` and `max`, from 0 to 1 (0 when the range is empty). */
export function rangeFraction(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

interface RangeBarProps {
  value: number;
  min: number;
  max: number;
  /** The suggested value, marked on the bar. */
  suggested?: number;
  /** What the bar shows at each end and reads aloud ("65 TND"). */
  format: (value: number) => string;
  /** Centered under the bar. */
  hint?: string;
}

const THUMB = 24;
const TRACK = 6;
const TICK = 14;

/**
 * Where the fare sits in the range drivers may be offered: the filled part
 * ends at the thumb, a tick marks the suggested value, the ends are labelled.
 * Display only; the stepper changes the value.
 */
export function RangeBar({ value, min, max, suggested, format, hint }: RangeBarProps) {
  const t = useTheme();
  const at = rangeFraction(value, min, max);
  return (
    <View style={styles.wrap}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${format(value)}, between ${format(min)} and ${format(max)}`}
        accessibilityValue={{ min, max, now: value }}
        style={styles.bar}
      >
        <View
          style={[styles.track, { backgroundColor: t.color.track, borderRadius: t.radius.full }]}
        >
          <View
            style={{
              width: `${at * 100}%`,
              height: TRACK,
              backgroundColor: t.color.brandAccent,
              borderRadius: t.radius.full,
            }}
          />
        </View>
        {suggested !== undefined ? (
          <View
            testID="range-suggested"
            style={[
              styles.tick,
              {
                start: `${rangeFraction(suggested, min, max) * 100}%`,
                backgroundColor: t.color.muted,
              },
            ]}
          />
        ) : null}
        <View
          testID="range-thumb"
          style={[
            styles.thumb,
            {
              start: `${at * 100}%`,
              backgroundColor: t.color.surface,
              borderColor: t.color.brandAccent,
              boxShadow: t.shadow.float,
            },
          ]}
        />
      </View>
      <View style={styles.labels}>
        <Text variant="caption" tone="muted">
          {format(min)}
        </Text>
        {hint ? (
          <Text variant="caption" tone="muted" style={styles.hint}>
            {hint}
          </Text>
        ) : null}
        <Text variant="caption" tone="muted">
          {format(max)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  // The thumb is centered on its position, so the bar keeps half a thumb of margin to stay inside.
  bar: { height: THUMB, justifyContent: 'center', marginHorizontal: THUMB / 2 },
  track: { height: TRACK, overflow: 'hidden' },
  tick: { position: 'absolute', width: 2, height: TICK, marginStart: -1, top: (THUMB - TICK) / 2 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    marginStart: -THUMB / 2,
  },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  hint: { textAlign: 'center' },
});
