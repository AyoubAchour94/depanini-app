import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme/theme';

/** A surface block for plain (non-map) screens: the surface colour, rounded, padded. */
export function Card({ style, ...props }: ViewProps) {
  const t = useTheme();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: t.color.surface,
          borderRadius: t.radius.xl,
          padding: t.space[4],
          gap: t.space[3],
        },
        style,
      ]}
    />
  );
}
