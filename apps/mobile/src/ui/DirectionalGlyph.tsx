import { StyleSheet } from 'react-native';

import { useDirection } from '@/i18n/direction';

import { Text, type TextProps } from './Text';

/**
 * A glyph that points along the reading direction, such as a "›" chevron or a
 * "‹" back arrow: mirrored when the layout runs right to left.
 */
export function DirectionalGlyph({ style, ...props }: TextProps) {
  const direction = useDirection();
  return <Text {...props} style={[style, direction === 'rtl' && styles.mirrored]} />;
}

const styles = StyleSheet.create({ mirrored: { transform: [{ scaleX: -1 }] } });
