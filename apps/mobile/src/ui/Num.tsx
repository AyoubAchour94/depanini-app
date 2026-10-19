import { Text as RNText } from 'react-native';

import { useTheme } from '@/theme/theme';

import { Text, type TextProps } from './Text';

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
 */
export function Num({ value, unit, size = 'figure', ...props }: NumProps) {
  const t = useTheme();
  const variant = variantFor[size];
  return (
    <Text variant={variant} {...props}>
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
