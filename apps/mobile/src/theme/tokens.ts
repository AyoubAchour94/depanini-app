// Design tokens of the redesign (docs/design/redesign-a/). The colour values
// are copied from the LIGHT and DARK objects of `dir-a2.cjs`; the only
// intended differences are noted where they occur. This is the one place in
// the app where colour literals are allowed.
import type { TextStyle } from 'react-native';

import type { AppVariant } from '@/variant/variants';

export const SCHEMES = ['light', 'dark'] as const;
export type Scheme = (typeof SCHEMES)[number];

/** Colours of the map (Mapbox style overrides and markers), per scheme and variant. */
export interface MapColors {
  land: string;
  water: string;
  park: string;
  block: string;
  minor: string;
  major: string;
  majorCasing: string;
  highway: string;
  label: string;
  route: string;
  routeCasing: string;
  pickup: string;
  dropoff: string;
  truck: string;
  onTruck: string;
  truckRing: string;
}

export interface Colors {
  /** Screen and map-land background. */
  background: string;
  /** Sheets, cards and floating controls. */
  surface: string;
  /** Fields, secondary buttons and other fills that sit on `surface`. */
  surface2: string;
  /** Hairlines and outlines. */
  line: string;
  /** Empty part of progress bars and range bars. */
  track: string;
  /** The grab handle of a sheet. */
  grab: string;
  text: string;
  muted: string;
  /** The app colour: blue for customers, amber for drivers. */
  brand: string;
  /** Same family as `brand`, bright enough as text or a line on `surface`s (links, selected borders, route, pins, progress). Equals `brand` in light. */
  brandAccent: string;
  /** Brand-coloured text on `surface`s (links, "Edit"); 4.5:1 on every surface. Amber is too light for this in light mode. */
  brandText: string;
  /** Text and icons on top of `brand`. */
  onBrand: string;
  /** Selected chips and soft highlights. May carry alpha (dark). */
  brandTint: string;
  success: string;
  /** Text in the success colour on a `surface`. */
  successText: string;
  successTint: string;
  warning: string;
  warningTint: string;
  /** Danger as text or an icon on `surface`s. */
  danger: string;
  /** Fill of destructive buttons. */
  dangerFill: string;
  /** Text on top of `dangerFill`. */
  onDanger: string;
  dangerTint: string;
  /** The dark navigation banner (driver job) and its text, border and plate colour. */
  banner: string;
  onBanner: string;
  bannerBorder: string;
  plate: string;
  /** Backdrop dimming for modals. */
  scrim: string;
  /** Initials-avatar backgrounds; white text is legible on all of them. */
  avatars: readonly string[];
  /** Initials on an avatar. */
  onAvatar: string;
  map: MapColors;
}

interface SchemeColors extends Omit<
  Colors,
  'brand' | 'brandAccent' | 'brandText' | 'onBrand' | 'brandTint' | 'map'
> {
  brands: Record<
    AppVariant,
    { brand: string; brandAccent: string; brandText: string; onBrand: string; brandTint: string }
  >;
  map: (accent: string) => MapColors;
}

const AVATARS = ['#0E9384', '#344054', '#7A5AF8', '#C4320A', '#1570EF', '#DD2590'] as const;

const light: SchemeColors = {
  background: '#EEF0F3',
  surface: '#FFFFFF',
  surface2: '#F4F5F7',
  line: '#ECEEF1',
  track: '#E4E7EC',
  grab: '#D5D9DF',
  text: '#0B0F19',
  // Darker than the mockup's #6B7280 so muted text reaches 4.5:1 on the grey background too.
  muted: '#656C78',
  success: '#12B76A',
  successText: '#067647',
  successTint: '#ECFDF3',
  warning: '#B54708',
  // Not in the mockups: a soft amber / red in the same family as the success tint.
  warningTint: '#FEF0C7',
  // Darker than the mockup's #D92D20 so danger text reaches 4.5:1 on the grey background.
  danger: '#C42B1C',
  dangerFill: '#C42B1C',
  onDanger: '#FFFFFF',
  dangerTint: '#FEE4E2',
  banner: '#0B0F19',
  onBanner: '#FFFFFF',
  bannerBorder: 'transparent',
  plate: '#0B0F19',
  scrim: 'rgba(11,15,25,.45)',
  avatars: AVATARS,
  onAvatar: '#FFFFFF',
  brands: {
    user: {
      brand: '#1463D9',
      brandAccent: '#1463D9',
      brandText: '#1463D9',
      onBrand: '#FFFFFF',
      brandTint: '#E8F0FC',
    },
    driver: {
      brand: '#F5A300',
      brandAccent: '#F5A300',
      brandText: '#946000',
      onBrand: '#0B0F19',
      brandTint: '#FFF4D6',
    },
  },
  map: (brand) => ({
    land: '#EEF0F3',
    water: '#D4E6F7',
    park: '#DDF0DA',
    block: '#ECEEF1',
    minor: '#FFFFFF',
    major: '#FFFFFF',
    majorCasing: '#DADFE5',
    highway: '#FFF4D6',
    label: '#9AA3AE',
    route: '#0B0F19',
    routeCasing: '#FFFFFF',
    pickup: brand,
    dropoff: '#0B0F19',
    truck: '#0B0F19',
    onTruck: '#FFFFFF',
    truckRing: '#FFFFFF',
  }),
};

const dark: SchemeColors = {
  background: '#0B0D10',
  surface: '#16191E',
  surface2: '#1F232A',
  line: '#2A2F37',
  track: '#2A2F37',
  grab: '#3A404A',
  text: '#F5F6F7',
  muted: '#8B93A0',
  success: '#22C55E',
  successText: '#4ADE80',
  successTint: 'rgba(34,197,94,.14)',
  warning: '#FDB022',
  warningTint: 'rgba(253,176,34,.16)',
  danger: '#F97066',
  // The mockups put white on #F97066 (2.7:1): the fill is a deeper red, the light red stays for text.
  dangerFill: '#DC2626',
  onDanger: '#FFFFFF',
  dangerTint: 'rgba(249,112,102,.16)',
  banner: '#1F232A',
  onBanner: '#F5F6F7',
  bannerBorder: '#2A2F37',
  plate: '#F5F6F7',
  scrim: 'rgba(0,0,0,.6)',
  avatars: AVATARS,
  onAvatar: '#FFFFFF',
  brands: {
    // The mockups put white on #4C8DFF (3.2:1): the fill is a deeper blue, the bright blue is the accent.
    user: {
      brand: '#2563EB',
      brandAccent: '#4C8DFF',
      brandText: '#4C8DFF',
      onBrand: '#FFFFFF',
      brandTint: 'rgba(76,141,255,.16)',
    },
    driver: {
      brand: '#FFB000',
      brandAccent: '#FFB000',
      brandText: '#FFB000',
      onBrand: '#0A0A0A',
      brandTint: 'rgba(255,176,0,.16)',
    },
  },
  map: (brand) => ({
    land: '#0B0D10',
    water: '#0C1E30',
    park: '#11241A',
    block: '#13161B',
    minor: '#1C2027',
    major: '#323944',
    majorCasing: '#0B0D10',
    highway: '#4A3C1A',
    label: '#4D5663',
    route: brand,
    routeCasing: '#0B0D10',
    pickup: brand,
    dropoff: '#FFFFFF',
    truck: brand,
    onTruck: '#0A0A0A',
    truckRing: '#0B0D10',
  }),
};

const schemes: Record<Scheme, SchemeColors> = { light, dark };

function colorsFor(scheme: Scheme, variant: AppVariant): Colors {
  const { brands, map, ...shared } = schemes[scheme];
  const brand = brands[variant];
  return { ...shared, ...brand, map: map(brand.brandAccent) };
}

/** Spacing in px, keyed by multiples of 4: `space[4]` is 16. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  /** Small tags. */
  xs: 6,
  sm: 10,
  /** Fields and secondary buttons. */
  md: 14,
  /** Primary buttons. */
  lg: 16,
  xl: 20,
  /** Top corners of a bottom sheet. */
  sheet: 28,
  /** Chips, pills and round buttons. */
  full: 999,
} as const;

/** Inter files loaded by `useAppFonts`; one family name per weight (React Native needs that). */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

/** IBM Plex Sans Arabic at the same steps, for all text in Arabic. It stops at 700. */
export const arabicFontFamily = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
  extrabold: 'IBMPlexSansArabic_700Bold',
} as const;

/** Which family the text is set in: Inter, or IBM Plex Sans Arabic when the language is Arabic. */
export type Script = 'latin' | 'arabic';

type FontFamilies = { [weight in keyof typeof fontFamily]: string };

type TypeStyle = Required<Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight'>> &
  Pick<TextStyle, 'letterSpacing' | 'fontVariant'>;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

/**
 * The type scale in one family. `tracking` scales the negative letter spacing
 * of the large steps: Arabic sets it to 0, as tightening would pull joined
 * letters apart.
 */
function typeScale(f: FontFamilies, tracking = 1) {
  return {
    /** Big figures: a fare, an ETA. Tabular numerals. */
    display: {
      fontFamily: f.extrabold,
      fontSize: 48,
      lineHeight: 52,
      letterSpacing: -1.5 * tracking,
      fontVariant: tabular,
    },
    /** Prices and distances in a screen. Tabular numerals. */
    figure: {
      fontFamily: f.extrabold,
      fontSize: 36,
      lineHeight: 40,
      letterSpacing: -1 * tracking,
      fontVariant: tabular,
    },
    /** Smaller figures: an offer price, a list row. Tabular numerals. */
    figureSmall: {
      fontFamily: f.extrabold,
      fontSize: 20,
      lineHeight: 24,
      letterSpacing: -0.4 * tracking,
      fontVariant: tabular,
    },
    title: { fontFamily: f.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 * tracking },
    heading: { fontFamily: f.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 * tracking },
    body: { fontFamily: f.regular, fontSize: 16, lineHeight: 22 },
    bodyStrong: { fontFamily: f.semibold, fontSize: 16, lineHeight: 22 },
    label: { fontFamily: f.semibold, fontSize: 14, lineHeight: 18 },
    caption: { fontFamily: f.medium, fontSize: 13, lineHeight: 17 },
    micro: { fontFamily: f.bold, fontSize: 11, lineHeight: 14 },
    button: { fontFamily: f.bold, fontSize: 17, lineHeight: 22 },
    buttonBig: { fontFamily: f.bold, fontSize: 19, lineHeight: 24 },
    buttonSmall: { fontFamily: f.semibold, fontSize: 15, lineHeight: 20 },
  } as const satisfies Record<string, TypeStyle>;
}

/** The type scale. Spread a style into a `Text`, or use the `Text` / `Num` primitives. */
export const type = typeScale(fontFamily);

/** The same scale in IBM Plex Sans Arabic. */
const arabicType = typeScale(arabicFontFamily, 0);

export type TypeVariant = keyof typeof type;

function typeFor(script: Script) {
  return script === 'arabic'
    ? { families: arabicFontFamily, scale: arabicType }
    : { families: fontFamily, scale: type };
}

/** Shadows as `boxShadow` strings, which React Native and React Native Web both accept. */
function shadowsFor(scheme: Scheme) {
  const ink = scheme === 'light' ? 'rgba(16,24,40,.14)' : 'rgba(0,0,0,.55)';
  return {
    none: 'none',
    /** Floating round buttons and pills. */
    float: `0 2px 10px ${ink}`,
    /** The bottom sheet (casts upward). */
    sheet: `0 -6px 30px ${ink}`,
  } as const;
}

export interface Theme {
  scheme: Scheme;
  variant: AppVariant;
  color: Colors;
  space: typeof space;
  radius: typeof radius;
  script: Script;
  type: typeof type;
  fontFamily: FontFamilies;
  shadow: ReturnType<typeof shadowsFor>;

  /** @deprecated Use `color.brand`. Kept so screens not restyled yet keep working. */
  brand: string;
  /** @deprecated Use `color.onBrand`. */
  onBrand: string;
  /** @deprecated Use `color.background`. */
  background: string;
  /** @deprecated Use `color.surface2` (fills) or `color.surface` (sheets). */
  surface: string;
  /** @deprecated Use `color.text`. */
  text: string;
  /** @deprecated Use `color.muted`. */
  textMuted: string;
  /** @deprecated Use `color.success`. */
  success: string;
  /** @deprecated Use `color.warning`. */
  warning: string;
  /** @deprecated Use `color.danger`. */
  danger: string;
}

/** Resolves every token for one scheme, app variant and script. */
export function buildTheme(scheme: Scheme, variant: AppVariant, script: Script = 'latin'): Theme {
  const color = colorsFor(scheme, variant);
  const { families, scale } = typeFor(script);
  return {
    scheme,
    variant,
    color,
    space,
    radius,
    script,
    type: scale,
    fontFamily: families,
    shadow: shadowsFor(scheme),
    brand: color.brand,
    onBrand: color.onBrand,
    background: color.background,
    surface: color.surface2,
    text: color.text,
    textMuted: color.muted,
    success: color.success,
    warning: color.warning,
    danger: color.danger,
  };
}
