import 'mapbox-gl/dist/mapbox-gl.css';

import { TUNIS_CENTER } from '@depanini/shared';
import mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';

import { useTheme } from '@/theme/theme';

import { mapStyleUrl } from './map-style';
import { markerColors } from './marker-colors';
import {
  FIT_MAX_ZOOM,
  fitPadding,
  markerIdsKey,
  ORNAMENT_TOP,
  type TunisMapProps,
} from './map-props';

const DEFAULT_ZOOM = 14;

function createMarkerElement(): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    borderStyle: 'solid',
    borderWidth: '3px',
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
  fitInsetBottom,
  ornamentOffset = 0,
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
  // The map is created once; a later theme change restyles it in place (see below).
  const scheme = useRef(theme.scheme);

  useEffect(() => {
    if (!container.current) return;
    const instance = new mapboxgl.Map({
      accessToken,
      container: container.current,
      style: mapStyleUrl(scheme.current),
      center: [initialCenter.current.longitude, initialCenter.current.latitude],
      zoom: DEFAULT_ZOOM,
      // The sheet covers the bottom of the map, so the ornaments move to the top.
      logoPosition: 'top-right',
      attributionControl: false,
    });
    instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'top-right');
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

  // Switch the style in place: same map, same markers, no remount.
  const appliedScheme = useRef(theme.scheme);
  useEffect(() => {
    scheme.current = theme.scheme;
    if (appliedScheme.current === theme.scheme) return;
    appliedScheme.current = theme.scheme;
    const instance = map.current;
    if (!instance) return;
    // Mapbox GL throws when a style is swapped while another is still loading.
    const apply = () => instance.setStyle(mapStyleUrl(scheme.current));
    if (instance.isStyleLoaded()) apply();
    else instance.once('style.load', apply);
  }, [theme.scheme]);

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
      const colors = markerColors(kind, theme);
      element.style.backgroundColor = colors.fill;
      element.style.borderColor = colors.ring;
      element.style.color = colors.glyph;
      element.style.boxShadow = theme.shadow.float;
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
      { padding: fitPadding(fitInsetBottom), maxZoom: FIT_MAX_ZOOM },
    );
  }, [idsKey, fitToMarkers, fitInsetBottom, accessToken]);

  return (
    <>
      <style>{`.mapboxgl-ctrl-top-left,.mapboxgl-ctrl-top-right{top:${ORNAMENT_TOP + ornamentOffset}px}`}</style>
      <div ref={container} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
    </>
  );
}
