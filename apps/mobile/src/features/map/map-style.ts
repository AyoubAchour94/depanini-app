import type { Scheme } from '@/theme/tokens';

/** Mapbox styles, both included in the free tier. */
export const MAP_STYLE_URL: Record<Scheme, string> = {
  light: 'mapbox://styles/mapbox/streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11',
};

/** The Mapbox style that goes with the app theme. */
export function mapStyleUrl(scheme: Scheme): string {
  return MAP_STYLE_URL[scheme];
}
