// The jest-expo preset runs in a node environment (react-native's jest setup
// can't be combined with the jsdom one), so give react-dom a DOM by hand.
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';

import type { MapMarker, TunisMapProps } from './map-props';
import { TunisMap } from './TunisMap.web';

jest.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}), { virtual: true });

let mockScheme: 'light' | 'dark' = 'light';
jest.mock('@/theme/theme', () => ({
  useTheme: () => jest.requireActual('@/theme/tokens').buildTheme(mockScheme, 'user'),
}));

interface Root {
  render: (element: ReturnType<typeof createElement>) => void;
  unmount: () => void;
}

const mockMaps: MockMap[] = [];
const mockMarkers: MockMarker[] = [];

interface MockMap {
  options: { style: string };
  styleLoaded: boolean;
  once: jest.Mock;
  setStyle: jest.Mock;
  jumpTo: jest.Mock;
  fitBounds: jest.Mock;
  remove: jest.Mock;
  handlers: Record<string, () => void>;
}
interface MockMarker {
  setLngLat: jest.Mock;
  addTo: jest.Mock;
  remove: jest.Mock;
  lngLat?: [number, number];
  getElement: () => HTMLElement;
}

jest.mock('mapbox-gl', () => {
  class Map {
    handlers: Record<string, () => void> = {};
    options: { style: string };
    styleLoaded = true;
    isStyleLoaded = () => this.styleLoaded;
    once = jest.fn((event: string, handler: () => void) => {
      this.handlers[`once:${event}`] = handler;
    });
    addControl = jest.fn();
    setStyle = jest.fn();
    jumpTo = jest.fn();
    fitBounds = jest.fn();
    remove = jest.fn();
    getCenter = () => ({ lat: 36.8, lng: 10.18 });
    on = (event: string, handler: () => void) => {
      this.handlers[event] = handler;
    };
    constructor(options: { style: string }) {
      this.options = options;
      mockMaps.push(this as unknown as MockMap);
    }
  }
  class Marker {
    lngLat?: [number, number];
    element: HTMLElement;
    setLngLat = jest.fn((lngLat: [number, number]) => {
      this.lngLat = lngLat;
      return this;
    });
    addTo = jest.fn(() => this);
    remove = jest.fn();
    getElement = () => this.element;
    constructor(options: { element: HTMLElement }) {
      this.element = options.element;
      mockMarkers.push(this as unknown as MockMarker);
    }
  }
  return { __esModule: true, default: { Map, Marker, AttributionControl: class {} } };
});

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the DOM globals exist
const { createRoot } = require('react-dom/client') as {
  createRoot: (container: Element) => Root;
};

const pickup: MapMarker = {
  id: 'pickup',
  kind: 'pickup',
  coordinate: { latitude: 36.8, longitude: 10.18 },
};
const truck: MapMarker = {
  id: 'truck',
  kind: 'truck',
  coordinate: { latitude: 36.82, longitude: 10.2 },
};

describe('TunisMap (web)', () => {
  let root: Root;

  function render(props: Partial<TunisMapProps>) {
    act(() => {
      root.render(createElement(TunisMap, { accessToken: 'pk.test', ...props }));
    });
  }

  beforeEach(() => {
    mockScheme = 'light';
    mockMaps.length = 0;
    mockMarkers.length = 0;
    root = createRoot(document.createElement('div'));
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it('starts on the style of the theme', () => {
    mockScheme = 'dark';
    render({});

    expect(mockMaps[0]!.options.style).toBe('mapbox://styles/mapbox/dark-v11');
  });

  it('restyles the same map when the theme changes, without recreating it or its markers', () => {
    render({ markers: [pickup] });
    expect(mockMaps[0]!.setStyle).not.toHaveBeenCalled();

    mockScheme = 'dark';
    render({ markers: [pickup] });

    expect(mockMaps).toHaveLength(1);
    expect(mockMaps[0]!.setStyle).toHaveBeenCalledTimes(1);
    expect(mockMaps[0]!.setStyle).toHaveBeenCalledWith('mapbox://styles/mapbox/dark-v11');
    expect(mockMaps[0]!.remove).not.toHaveBeenCalled();
    expect(mockMarkers).toHaveLength(1);
    expect(mockMarkers[0]!.remove).not.toHaveBeenCalled();
  });

  it('waits for a style that is still loading before swapping it', () => {
    render({});
    mockMaps[0]!.styleLoaded = false;

    mockScheme = 'dark';
    render({});
    expect(mockMaps[0]!.setStyle).not.toHaveBeenCalled();

    mockMaps[0]!.handlers['once:style.load']!();
    expect(mockMaps[0]!.setStyle).toHaveBeenCalledWith('mapbox://styles/mapbox/dark-v11');
  });

  it('colours markers from the map tokens', () => {
    render({ markers: [pickup] });
    const light = mockMarkers[0]!.getElement().style.backgroundColor;

    mockScheme = 'dark';
    render({ markers: [pickup] });

    expect(mockMarkers[0]!.getElement().style.backgroundColor).not.toBe(light);
  });

  it('draws no markers and never fits the camera without markers', () => {
    render({ fitToMarkers: true });

    expect(mockMarkers).toHaveLength(0);
    expect(mockMaps[0]!.fitBounds).not.toHaveBeenCalled();
  });

  it('keeps recentering with jumpTo in center-pin mode', () => {
    render({ center: { latitude: 36.8, longitude: 10.18 } });
    render({ center: { latitude: 36.9, longitude: 10.3 } });

    expect(mockMaps[0]!.jumpTo).toHaveBeenLastCalledWith({ center: [10.3, 36.9] });
  });

  it('adds one marker per id', () => {
    render({ markers: [pickup, truck] });

    expect(mockMarkers).toHaveLength(2);
    expect(mockMarkers[0]!.addTo).toHaveBeenCalledWith(mockMaps[0]);
    expect(mockMarkers[0]!.lngLat).toEqual([10.18, 36.8]);
  });

  it('moves the same marker when its coordinate changes', () => {
    render({ markers: [pickup, truck] });
    render({
      markers: [pickup, { ...truck, coordinate: { latitude: 36.81, longitude: 10.19 } }],
    });

    expect(mockMarkers).toHaveLength(2);
    expect(mockMarkers[1]!.setLngLat).toHaveBeenLastCalledWith([10.19, 36.81]);
    expect(mockMarkers[1]!.remove).not.toHaveBeenCalled();
  });

  it('removes a marker when its id disappears', () => {
    render({ markers: [pickup, truck] });
    render({ markers: [pickup] });

    expect(mockMarkers[1]!.remove).toHaveBeenCalled();
    expect(mockMarkers[0]!.remove).not.toHaveBeenCalled();
  });

  it('fits the camera when the set of ids changes, not when a coordinate moves', () => {
    render({ markers: [pickup], fitToMarkers: true });
    const fit = mockMaps[0]!.fitBounds;
    expect(fit).toHaveBeenCalledTimes(1);

    render({
      markers: [{ ...pickup, coordinate: { latitude: 36.81, longitude: 10.19 } }],
      fitToMarkers: true,
    });
    expect(fit).toHaveBeenCalledTimes(1);

    render({ markers: [pickup, truck], fitToMarkers: true });
    expect(fit).toHaveBeenCalledTimes(2);
    expect(fit).toHaveBeenLastCalledWith(
      [
        [10.18, 36.8],
        [10.2, 36.82],
      ],
      { padding: 60, maxZoom: 15 },
    );
  });
});
