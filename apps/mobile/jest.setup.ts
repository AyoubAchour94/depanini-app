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

// No native notification module under Jest. Tests that care override these.
jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { MAX: 5, HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: 'fcm', data: 'device-token' })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
  getIdToken: jest.fn(),
}));
