import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme/theme';

interface SheetProps extends ViewProps {
  children: ReactNode;
  /** The grab handle on top. Default on; it only hints at dragging until the map shell adds it. */
  grabber?: boolean;
}

/**
 * The card a bottom sheet is made of: surface colour, rounded top corners and
 * a shadow cast upward. Static for now; the map-first shell adds the drag and
 * snap points around it.
 */
export function Sheet({ children, grabber = true, style, ...props }: SheetProps) {
  const t = useTheme();
  return (
    <View
      {...props}
      style={[
        styles.sheet,
        {
          backgroundColor: t.color.surface,
          borderTopLeftRadius: t.radius.sheet,
          borderTopRightRadius: t.radius.sheet,
          boxShadow: t.shadow.sheet,
          borderTopWidth: t.scheme === 'dark' ? 1 : 0,
          borderTopColor: t.color.line,
        },
        style,
      ]}
    >
      {grabber ? <View style={[styles.grabber, { backgroundColor: t.color.grab }]} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingTop: 10, paddingHorizontal: 20, paddingBottom: 34 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
});
