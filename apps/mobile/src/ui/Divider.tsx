import { View } from 'react-native';

import { useTheme } from '@/theme/theme';

/** A 1px hairline in the theme's line colour, with 14px of space above and below. */
export function Divider() {
  const t = useTheme();
  return (
    <View
      accessibilityRole="none"
      style={{ height: 1, backgroundColor: t.color.line, marginVertical: 14 }}
    />
  );
}
