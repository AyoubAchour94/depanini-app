import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme';

import { Text } from './Text';

interface StageBarProps {
  /** Stage labels in order: ["Heading", "Arrived", "Loaded", "Done"]. */
  stages: readonly string[];
  /** Index of the current stage. Earlier stages are full. */
  current: number;
  /** How far through the current stage, 0 to 1. Default: the stage is just reached (empty). */
  progress?: number;
}

/** A segmented progress bar with a label under each segment. */
export function StageBar({ stages, current, progress = 0 }: StageBarProps) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={stages[current]}
      accessibilityValue={{ min: 0, max: stages.length, now: current }}
      style={styles.row}
    >
      {stages.map((stage, i) => {
        const fill = i < current ? 1 : i === current ? Math.min(Math.max(progress, 0), 1) : 0;
        return (
          <View key={stage} style={styles.stage}>
            <View style={[styles.track, { backgroundColor: t.color.track }]}>
              <View
                style={{ width: `${fill * 100}%`, height: 5, backgroundColor: t.color.brand }}
              />
            </View>
            <Text
              variant="micro"
              tone={i <= current ? 'text' : 'muted'}
              style={[styles.label, i !== current && { fontFamily: t.fontFamily.medium }]}
            >
              {stage}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  stage: { flex: 1 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  label: { marginTop: 6 },
});
