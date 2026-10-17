// Native modules have no JS implementation under Jest; replace them with
// minimal stand-ins so screens render hermetically (no network, no device).

jest.mock('@rnmapbox/maps', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Mapbox = { setAccessToken: jest.fn(async () => null), StyleURL: { Street: 'street' } };
  return {
    __esModule: true,
    default: Mapbox,
    MapView: (props: object) => createElement(View, { testID: 'mapbox-map', ...props }),
    Camera: () => null,
    MarkerView: ({ children }: { children: unknown }) => children,
  };
});

jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(() => {
    throw new Error('No Firebase App has been created');
  }),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
  getIdToken: jest.fn(),
}));
