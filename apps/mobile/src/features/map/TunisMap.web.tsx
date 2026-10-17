import 'mapbox-gl/dist/mapbox-gl.css';

import { TUNIS_CENTER } from '@depanini/shared';
import mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';

import { useTheme } from '@/theme/theme';

const DEFAULT_ZOOM = 12;
const TUNIS: [number, number] = [TUNIS_CENTER.longitude, TUNIS_CENTER.latitude];

/**
 * Web counterpart of TunisMap.tsx: the native Mapbox SDK doesn't run in a
 * browser, so the web build uses Mapbox GL JS with the same style, center and pin.
 */
export function TunisMap({ accessToken }: { accessToken: string }) {
  const theme = useTheme();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = new mapboxgl.Map({
      accessToken,
      container: container.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: TUNIS,
      zoom: DEFAULT_ZOOM,
    });

    const pin = document.createElement('div');
    Object.assign(pin.style, {
      width: '22px',
      height: '22px',
      borderRadius: '11px',
      border: `3px solid ${theme.onBrand}`,
      backgroundColor: theme.brand,
    });
    new mapboxgl.Marker({ element: pin }).setLngLat(TUNIS).addTo(map);

    return () => map.remove();
  }, [accessToken, theme.brand, theme.onBrand]);

  return <div ref={container} style={{ position: 'absolute', inset: 0 }} />;
}
