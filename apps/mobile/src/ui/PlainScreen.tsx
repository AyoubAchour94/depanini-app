import { type ReactNode, useContext } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';

/**
 * A screen without a map and without a navigation header (the request screen
 * hides it for the map): scrolling content under the top inset, and an
 * optional pinned footer for the one next action.
 */
export function PlainScreen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const t = useTheme();
  const insets = useContext(SafeAreaInsetsContext);
  return (
    <View style={[styles.fill, { backgroundColor: t.color.background }]}>
      <ScrollView
        contentContainerStyle={{
          padding: t.space[4],
          paddingTop: (insets?.top ?? 0) + t.space[6],
          gap: t.space[4],
        }}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            padding: t.space[4],
            paddingBottom: Math.max(insets?.bottom ?? 0, t.space[4]),
            gap: t.space[2],
            backgroundColor: t.color.surface,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/** A centred message state: loading, an error, nothing to show. */
export function CenterState({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.fill,
        styles.center,
        { backgroundColor: t.color.background, padding: t.space[6], gap: t.space[3] },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
