import 'mapbox-gl/dist/mapbox-gl.css';

import { TUNIS_CENTER } from '@depanini/shared';
import mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';

import type { TunisMapProps } from './map-props';

const DEFAULT_ZOOM = 14;

/**
 * Web counterpart of TunisMap.tsx: the native Mapbox SDK doesn't run in a
 * browser, so the web build uses Mapbox GL JS with the same style, props and
 * behavior (no pin of its own; see `CenterPin`).
 */
export function TunisMap({ accessToken, center = TUNIS_CENTER, onCenterChange }: TunisMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  // Always call the latest callback without recreating the map.
  const onChange = useRef(onCenterChange);
  useEffect(() => {
    onChange.current = onCenterChange;
  });
  const initialCenter = useRef(center);

  useEffect(() => {
    if (!container.current) return;
    const instance = new mapboxgl.Map({
      accessToken,
      container: container.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [initialCenter.current.longitude, initialCenter.current.latitude],
      zoom: DEFAULT_ZOOM,
    });
    instance.on('moveend', () => {
      const { lat, lng } = instance.getCenter();
      onChange.current?.({ latitude: lat, longitude: lng });
    });
    map.current = instance;
    return () => {
      map.current = null;
      instance.remove();
    };
  }, [accessToken]);

  useEffect(() => {
    map.current?.jumpTo({ center: [center.longitude, center.latitude] });
  }, [center.latitude, center.longitude]);

  return <div ref={container} style={{ position: 'absolute', inset: 0 }} />;
}
