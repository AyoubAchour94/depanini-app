import { LocaleProvider } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useDirection } from './direction';

/**
 * Lays the app out in the direction of the active language, at once and on
 * every platform: Yoga's `direction` on native (start/end, rows), the `dir`
 * attribute on web (React Native Web resolves start/end from it), and the
 * router's `LocaleProvider` for headers and transitions. `I18nManager`
 * follows on the next start (`applyDirection`).
 */
export function DirectionRoot({ children }: { children: ReactNode }) {
  const direction = useDirection();
  const web = Platform.OS === 'web' ? ({ dir: direction } as object) : {};
  return (
    <LocaleProvider direction={direction}>
      <View testID="direction-root" style={[styles.root, { direction }]} {...web}>
        {children}
      </View>
    </LocaleProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
