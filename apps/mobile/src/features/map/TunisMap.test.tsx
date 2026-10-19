import { render, screen } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';

import type { MapMarker } from './map-props';
import { TunisMap } from './TunisMap';

const mockFitBounds = jest.fn();
const mockSetCamera = jest.fn();

jest.mock('@rnmapbox/maps', () => {
  const { createElement, forwardRef, useImperativeHandle } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { setAccessToken: jest.fn(async () => null), StyleURL: { Street: 'street' } },
    MapView: ({ children, styleURL }: { children: unknown; styleURL: string }) =>
      createElement(View, { testID: 'mapbox-map', accessibilityLabel: styleURL }, children),
    Camera: forwardRef((_props: object, ref: unknown) => {
      useImperativeHandle(ref, () => ({ fitBounds: mockFitBounds, setCamera: mockSetCamera }));
      return null;
    }),
    MarkerView: ({ children, coordinate }: { children: unknown; coordinate: number[] }) =>
      createElement(
        View,
        { testID: 'marker-view', accessibilityLabel: coordinate.join(',') },
        children,
      ),
  };
});

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

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: jest.fn(() => 'light'),
}));

describe('TunisMap (native)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('follows the theme with the light and dark Mapbox styles', async () => {
    const scheme = jest.mocked(useColorScheme);
    scheme.mockReturnValue('light');
    const { rerender } = await render(<TunisMap accessToken="pk.test" />);
    expect(screen.getByTestId('mapbox-map').props.accessibilityLabel).toBe(
      'mapbox://styles/mapbox/streets-v12',
    );

    scheme.mockReturnValue('dark');
    await rerender(<TunisMap accessToken="pk.test" />);
    expect(screen.getByTestId('mapbox-map').props.accessibilityLabel).toBe(
      'mapbox://styles/mapbox/dark-v11',
    );
  });

  it('renders no markers and never fits the camera without markers', async () => {
    await render(<TunisMap accessToken="pk.test" fitToMarkers />);

    expect(screen.queryAllByTestId('marker-view')).toHaveLength(0);
    expect(mockFitBounds).not.toHaveBeenCalled();
    expect(mockSetCamera).not.toHaveBeenCalled();
  });

  it('renders one marker view per marker', async () => {
    await render(<TunisMap accessToken="pk.test" markers={[pickup, truck]} />);

    expect(screen.getAllByTestId('marker-view')).toHaveLength(2);
    expect(screen.getByTestId('marker-truck')).toBeOnTheScreen();
  });

  it('moves the same marker when its coordinate changes', async () => {
    const { rerender } = await render(<TunisMap accessToken="pk.test" markers={[pickup, truck]} />);
    await rerender(
      <TunisMap
        accessToken="pk.test"
        markers={[pickup, { ...truck, coordinate: { latitude: 36.81, longitude: 10.19 } }]}
      />,
    );

    expect(screen.getAllByTestId('marker-view')).toHaveLength(2);
    expect(screen.getByLabelText('10.19,36.81')).toBeOnTheScreen();
  });

  it('removes a marker when its id disappears', async () => {
    const { rerender } = await render(<TunisMap accessToken="pk.test" markers={[pickup, truck]} />);
    await rerender(<TunisMap accessToken="pk.test" markers={[pickup]} />);

    expect(screen.getAllByTestId('marker-view')).toHaveLength(1);
    expect(screen.queryByTestId('marker-truck')).toBeNull();
  });

  it('fits the camera when the set of ids changes, not when a coordinate moves', async () => {
    const { rerender } = await render(
      <TunisMap accessToken="pk.test" markers={[pickup]} fitToMarkers />,
    );
    // A single marker centers on it instead of fitting a zero-size box.
    expect(mockSetCamera).toHaveBeenCalledTimes(1);
    expect(mockSetCamera).toHaveBeenLastCalledWith({
      centerCoordinate: [10.18, 36.8],
      zoomLevel: 15,
      animationDuration: 0,
    });

    await rerender(
      <TunisMap
        accessToken="pk.test"
        markers={[{ ...pickup, coordinate: { latitude: 36.81, longitude: 10.19 } }]}
        fitToMarkers
      />,
    );
    expect(mockSetCamera).toHaveBeenCalledTimes(1);

    await rerender(<TunisMap accessToken="pk.test" markers={[pickup, truck]} fitToMarkers />);
    expect(mockFitBounds).toHaveBeenCalledTimes(1);
    expect(mockFitBounds).toHaveBeenLastCalledWith([10.2, 36.82], [10.18, 36.8], 60, 0);
  });
});
