import { i18n } from '@/i18n';

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

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(async () => 'device-token'),
  onTokenRefresh: jest.fn(() => jest.fn()),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { MAX: 5, HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
  getIdToken: jest.fn(),
}));

// In-memory storage; tests that care reset it with `AsyncStorage.clear()`.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Error reporting is off in tests (no DSN); the SDK itself is ESM and has native modules.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
}));

// French is the app's default; tests pin English so they read the same on any default.
void i18n.changeLanguage('en');
