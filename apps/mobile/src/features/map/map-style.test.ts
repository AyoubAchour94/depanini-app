import { buildTheme } from '@/theme/tokens';

import { mapStyleUrl } from './map-style';
import { markerColors } from './marker-colors';

describe('mapStyleUrl', () => {
  it('uses streets-v12 in light and dark-v11 in dark', () => {
    expect(mapStyleUrl('light')).toBe('mapbox://styles/mapbox/streets-v12');
    expect(mapStyleUrl('dark')).toBe('mapbox://styles/mapbox/dark-v11');
  });
});

describe('markerColors', () => {
  it('takes every colour from the map tokens of the theme', () => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const variant of ['user', 'driver'] as const) {
        const t = buildTheme(scheme, variant);
        expect(markerColors('pickup', t).fill).toBe(t.color.map.pickup);
        expect(markerColors('dropoff', t).fill).toBe(t.color.map.dropoff);
        expect(markerColors('truck', t)).toEqual({
          fill: t.color.map.truck,
          ring: t.color.map.truckRing,
          glyph: t.color.map.onTruck,
        });
      }
    }
  });

  it('keeps the pickup in the bright accent in dark', () => {
    const t = buildTheme('dark', 'user');
    expect(markerColors('pickup', t).fill).toBe(t.color.brandAccent);
  });
});
