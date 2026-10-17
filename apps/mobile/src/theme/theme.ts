import { useColorScheme } from 'react-native';

import { variant } from '@/variant/variant';

export interface Theme {
  /** Variant brand color (blue for customers, amber for drivers). */
  brand: string;
  /** Text/icon color that stays legible on top of `brand`. */
  onBrand: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  success: string;
  warning: string;
  danger: string;
}

const palettes = {
  light: {
    background: '#FFFFFF',
    surface: '#F2F4F7',
    text: '#101828',
    textMuted: '#667085',
    success: '#12B76A',
    warning: '#F79009',
    danger: '#D92D20',
  },
  dark: {
    background: '#0C111D',
    surface: '#1D2939',
    text: '#F5F5F6',
    textMuted: '#98A2B3',
    success: '#32D583',
    warning: '#FDB022',
    danger: '#F97066',
  },
};

/** Picks black or white text for a hex background using its relative luminance. */
export function contrastingTextColor(hex: string): string {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#101828' : '#FFFFFF';
}

export function buildTheme(scheme: 'light' | 'dark', brand: string): Theme {
  return { ...palettes[scheme], brand, onBrand: contrastingTextColor(brand) };
}

/** The current theme: system light/dark, tinted with the variant's brand color. */
export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return buildTheme(scheme, variant.brandColor);
}
