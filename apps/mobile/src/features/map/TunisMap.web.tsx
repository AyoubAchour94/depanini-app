import 'mapbox-gl/dist/mapbox-gl.css';

import { TUNIS_CENTER } from '@depanini/shared';
import mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';

import { useTheme } from '@/theme/theme';

import { markerColor } from './marker-colors';
import { FIT_MAX_ZOOM, FIT_PADDING, markerIdsKey, type TunisMapProps } from './map-props';

const DEFAULT_ZOOM = 14;

function createMarkerElement(): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    border: '3px solid #FFFFFF',
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
  });
  return el;
}

/**
 * Web counterpart of TunisMap.tsx: the native Mapbox SDK doesn't run in a
 * browser, so the web build uses Mapbox GL JS with the same style, props and
 * behavior (no center pin of its own; see `CenterPin`).
 */
export function TunisMap({
  accessToken,
  center = TUNIS_CENTER,
  onCenterChange,
  markers,
  fitToMarkers,
}: TunisMapProps) {
  const theme = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markerById = useRef(new Map<string, mapboxgl.Marker>());
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
    const drawn = markerById.current;
    return () => {
      drawn.forEach((marker) => marker.remove());
      drawn.clear();
      map.current = null;
      instance.remove();
    };
  }, [accessToken]);

  useEffect(() => {
    map.current?.jumpTo({ center: [center.longitude, center.latitude] });
  }, [center.latitude, center.longitude]);

  // One marker per id: create on first sight, move on update, remove when gone.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const drawn = markerById.current;
    const ids = new Set((markers ?? []).map((m) => m.id));
    drawn.forEach((marker, id) => {
      if (!ids.has(id)) {
        marker.remove();
        drawn.delete(id);
      }
    });
    for (const { id, kind, coordinate } of markers ?? []) {
      let marker = drawn.get(id);
      if (!marker) {
        const element = createMarkerElement();
        marker = new mapboxgl.Marker({ element }).setLngLat([0, 0]).addTo(instance);
        drawn.set(id, marker);
      }
      const element = marker.getElement();
      const size = kind === 'truck' ? 34 : 24;
      element.style.width = `${size}px`;
      element.style.height = `${size}px`;
      element.style.backgroundColor = markerColor(kind, theme);
      element.textContent = kind === 'truck' ? '🚚' : '';
      marker.setLngLat([coordinate.longitude, coordinate.latitude]);
    }
  }, [markers, accessToken, theme]);

  // Fit only when ids are added or removed; read the coordinates through a ref.
  const latestMarkers = useRef(markers);
  useEffect(() => {
    latestMarkers.current = markers;
  });
  const idsKey = markerIdsKey(markers);
  useEffect(() => {
    const points = latestMarkers.current ?? [];
    if (!fitToMarkers || points.length === 0) return;
    const lngs = points.map((m) => m.coordinate.longitude);
    const lats = points.map((m) => m.coordinate.latitude);
    map.current?.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM },
    );
  }, [idsKey, fitToMarkers, accessToken]);

  return <div ref={container} style={{ position: 'absolute', inset: 0 }} />;
}
