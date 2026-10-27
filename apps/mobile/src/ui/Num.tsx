import { Text as RNText } from 'react-native';

import { useDirection } from '@/i18n/direction';
import { useTheme } from '@/theme/theme';

import { Text, type TextProps } from './Text';

const RLM = '‏';

interface NumProps extends Omit<TextProps, 'variant' | 'children'> {
  /** The figure, already formatted: "85", "18.4", "14:12". */
  value: string | number;
  /** A unit set smaller after the figure: "TND", "km", "min". */
  unit?: string;
  /** `display` is the big fare, `figure` a screen figure, `small` a row figure. */
  size?: 'display' | 'figure' | 'small';
}

const variantFor = { display: 'display', figure: 'figure', small: 'figureSmall' } as const;

/**
 * A number with tabular figures, so prices, distances and ETAs keep their
 * width while they count down or change. Reads as one text ("85 TND").
 * In a right-to-left language it reads in that order too: the figure on the
 * right, the unit to its left.
 */
export function Num({ value, unit, size = 'figure', ...props }: NumProps) {
  const t = useTheme();
  const direction = useDirection();
  const variant = variantFor[size];
  // The right-to-left mark sets the paragraph's direction, which "85 TND" alone would leave left to right.
  const mark = unit && direction === 'rtl' ? RLM : '';
  return (
    <Text variant={variant} {...props}>
      {mark}
      {value}
      {unit ? (
        <RNText
          style={{
            fontFamily: t.fontFamily.bold,
            fontSize: size === 'small' ? 12 : 15,
            letterSpacing: 0,
          }}
        >
          {` ${unit}`}
        </RNText>
      ) : null}
    </Text>
  );
}
