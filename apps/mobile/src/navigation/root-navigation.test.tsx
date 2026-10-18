import * as SplashScreen from 'expo-splash-screen';
import { Text } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { AuthUser } from '@/auth/firebase-auth';
import * as firebaseAuth from '@/auth/firebase-auth';
import LoadingAccount from '@/app/loading-account';
import Onboarding from '@/app/onboarding';
import SignIn from '@/app/sign-in';
import RootLayout from '@/app/_layout';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => {}),
}));

jest.mock('@/firebase/firebase', () => ({
  getFirebaseStatus: () => ({ configured: true }),
  getCurrentIdToken: async () => 'id-token',
}));

// The auth listener is driven by the test through `mockEmitUser`.
let mockEmitUser: (user: AuthUser | null) => void = () => {};
jest.mock('@/auth/firebase-auth', () => ({
  subscribeToAuth: jest.fn((listener: (user: AuthUser | null) => void) => {
    mockEmitUser = listener;
    return () => {};
  }),
  signIn: jest.fn(async () => {}),
  signUp: jest.fn(async () => {}),
  sendPasswordReset: jest.fn(async () => {}),
  signOut: jest.fn(async () => {}),
}));

jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: 'http://api.test', environment: 'dev' },
}));

/** Reports a session change from Firebase, as the real listener would. */
async function emitSession(user: AuthUser | null) {
  await act(async () => mockEmitUser(user));
}

const me = { id: '7b0f1a52-3c43-4c1e-9d0e-2f6b1d8f5a10', email: 'ali@example.com' };
const profile = { fullName: 'Ali Ben Salah', phone: '+21698123456' };

/** Fakes the API: `GET /me` answers with `customerProfile`, `PUT` echoes the profile back. */
function mockApi(customerProfile: typeof profile | null) {
  jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (_url, init) =>
      init?.method === 'PUT'
        ? Response.json(JSON.parse(String(init.body)))
        : Response.json({ ...me, customerProfile, driverProfile: null }),
    );
}

function putRequests() {
  return jest.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT');
}

/** The real root layout and sign-in/onboarding screens; the app screens are stand-ins. */
function renderApp() {
  return renderRouter({
    _layout: RootLayout,
    index: () => <Text>Home</Text>,
    account: () => <Text>Account</Text>,
    profile: () => <Text>Profile</Text>,
    onboarding: Onboarding,
    'loading-account': LoadingAccount,
    'sign-in': SignIn,
    'sign-up': () => <Text>Sign up</Text>,
    'forgot-password': () => <Text>Forgot password</Text>,
  });
}

describe('root navigation', () => {
  beforeEach(() => mockApi(profile));

  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(SplashScreen.hideAsync).mockClear();
  });

  it('keeps the splash screen up until Firebase reports the session', async () => {
    await renderApp();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

    await emitSession(null);
    await waitFor(() => expect(SplashScreen.hideAsync).toHaveBeenCalled());
  });

  it('sends a signed-out user to sign-in', async () => {
    const router = await renderApp();
    await emitSession(null);

    expect(await screen.findByText('Sign in to continue.')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/sign-in');
  });

  it('shows the app to a signed-in customer with a profile', async () => {
    const router = await renderApp();
    await emitSession({ uid: 'u1', email: me.email });

    expect(await screen.findByText('Home')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(new URL('/me', 'http://api.test'), expect.anything()),
    );
  });

  it('leaves sign-in once the user signs in, and returns on sign-out', async () => {
    const router = await renderApp();
    await emitSession(null);

    await fireEvent.changeText(await screen.findByLabelText('Email'), ' ali@example.com ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret1');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(firebaseAuth.signIn).toHaveBeenCalledWith('ali@example.com', 'secret1'),
    );

    await emitSession({ uid: 'u1', email: me.email });
    expect(await screen.findByText('Home')).toBeOnTheScreen();

    await emitSession(null);
    expect(await screen.findByText('Sign in to continue.')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/sign-in');
  });

  it('shows a readable message when sign-in fails', async () => {
    jest
      .mocked(firebaseAuth.signIn)
      .mockRejectedValueOnce(Object.assign(new Error(), { code: 'auth/invalid-credential' }));
    await renderApp();
    await emitSession(null);

    await fireEvent.changeText(await screen.findByLabelText('Email'), 'ali@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email or password is incorrect.')).toBeOnTheScreen();
  });

  it('sends a customer without a profile to onboarding, then to the app once saved', async () => {
    mockApi(null);
    const router = await renderApp();
    await emitSession({ uid: 'u1', email: me.email });

    expect(await screen.findByText('Tell us about you')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/onboarding');

    await fireEvent.changeText(screen.getByLabelText('Full name'), ' Ali Ben Salah ');
    await fireEvent.changeText(screen.getByLabelText('Phone'), '98 123 456');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Home')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
    const [[url, init]] = putRequests();
    expect(url).toEqual(new URL('/me/customer-profile', 'http://api.test'));
    expect(JSON.parse(String(init?.body))).toEqual(profile);
  });

  it('checks the details before saving them', async () => {
    mockApi(null);
    await renderApp();
    await emitSession({ uid: 'u1', email: me.email });

    await fireEvent.changeText(await screen.findByLabelText('Phone'), '+33 6 12 34 56 78');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Enter your name')).toBeOnTheScreen();
    expect(
      screen.getByText('Enter a Tunisian number: +216 followed by 8 digits'),
    ).toBeOnTheScreen();
    expect(putRequests()).toHaveLength(0);
  });
});
