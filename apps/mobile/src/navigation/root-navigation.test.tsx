import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Text } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { AuthUser } from '@/auth/firebase-auth';
import * as firebaseAuth from '@/auth/firebase-auth';
import DeleteAccount from '@/app/delete-account';
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
  reauthenticate: jest.fn(async () => {}),
  // Like Firebase, deleting the user signs them out.
  deleteCurrentUser: jest.fn(async () => mockEmitUser(null)),
}));

// Each test picks the app it runs as; the customer app unless it says otherwise.
let mockVariantName: 'user' | 'driver' = 'user';
jest.mock('@/variant/variant', () => ({
  get variant() {
    return jest.requireActual('@/variant/variants').VARIANTS[mockVariantName];
  },
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
const driverProfile = {
  fullName: 'Sami Trabelsi',
  phone: '+21622333444',
  truckType: 'wheel_lift',
  plateNumber: '123 TU 4567',
};

/**
 * Fakes the API: `GET /me` answers with the given profiles, `PUT` echoes the
 * profile back, `DELETE` answers 204.
 */
function mockApi(profiles: { customerProfile?: object; driverProfile?: object }) {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.method === 'PUT') return Response.json(JSON.parse(String(init.body)));
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({
      ...me,
      customerProfile: profiles.customerProfile ?? null,
      driverProfile: profiles.driverProfile ?? null,
    });
  });
}

function requestsWith(method: 'PUT' | 'DELETE') {
  return jest.mocked(fetch).mock.calls.filter(([, init]) => init?.method === method);
}

const putRequests = () => requestsWith('PUT');

/** The real root layout and sign-in/onboarding screens; the app screens are stand-ins. */
function renderApp() {
  return renderRouter({
    _layout: RootLayout,
    index: () => <Text>Home</Text>,
    account: () => <Text>Account</Text>,
    profile: () => <Text>Profile</Text>,
    onboarding: Onboarding,
    'loading-account': LoadingAccount,
    'delete-account': DeleteAccount,
    'sign-in': SignIn,
    'sign-up': () => <Text>Sign up</Text>,
    'forgot-password': () => <Text>Forgot password</Text>,
  });
}

describe('root navigation', () => {
  beforeEach(() => {
    mockVariantName = 'user';
    mockApi({ customerProfile: profile });
  });

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
    mockApi({});
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
    mockApi({});
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

  describe('in the driver app', () => {
    beforeEach(() => {
      mockVariantName = 'driver';
    });

    it('shows the app to a driver with a profile', async () => {
      mockApi({ driverProfile });
      const router = await renderApp();
      await emitSession({ uid: 'u1', email: me.email });

      expect(await screen.findByText('Home')).toBeOnTheScreen();
      expect(router.getPathname()).toBe('/');
    });

    it('onboards an account that only has a customer profile', async () => {
      mockApi({ customerProfile: profile });
      const router = await renderApp();
      await emitSession({ uid: 'u1', email: me.email });

      expect(await screen.findByText('Set up your driver profile')).toBeOnTheScreen();
      expect(router.getPathname()).toBe('/onboarding');
    });

    it('takes personal details, then truck details, then shows the app', async () => {
      mockApi({});
      const router = await renderApp();
      await emitSession({ uid: 'u1', email: me.email });

      expect(await screen.findByText('Step 1 of 2: your details')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
      expect(await screen.findByText('Enter your name')).toBeOnTheScreen();

      await fireEvent.changeText(screen.getByLabelText('Full name'), 'Sami Trabelsi');
      await fireEvent.changeText(screen.getByLabelText('Phone'), '22 333 444');
      await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
      expect(await screen.findByText('Step 2 of 2: your truck')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
      expect(await screen.findByText('Choose your truck type')).toBeOnTheScreen();
      expect(screen.getByText('Enter your plate number')).toBeOnTheScreen();
      expect(putRequests()).toHaveLength(0);

      await fireEvent.press(screen.getByRole('radio', { name: 'Wheel-lift' }));
      await fireEvent.changeText(screen.getByLabelText('Plate number'), ' 123 tu 4567 ');
      await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));

      expect(await screen.findByText('Home')).toBeOnTheScreen();
      expect(router.getPathname()).toBe('/');
      const [[url, init]] = putRequests();
      expect(url).toEqual(new URL('/me/driver-profile', 'http://api.test'));
      expect(JSON.parse(String(init?.body))).toEqual(driverProfile);
    });
  });

  describe('account deletion', () => {
    beforeEach(() => {
      jest.mocked(firebaseAuth.reauthenticate).mockClear();
      jest.mocked(firebaseAuth.deleteCurrentUser).mockClear();
    });

    /** Signs in with a complete profile and opens the confirmation screen. */
    async function openDeleteAccount() {
      const rendered = await renderApp();
      await emitSession({ uid: 'u1', email: me.email });
      expect(await screen.findByText('Home')).toBeOnTheScreen();
      await act(async () => router.push('/delete-account'));
      expect(await screen.findByText('Delete your account?')).toBeOnTheScreen();
      return rendered;
    }

    it('confirms the password, deletes the account, then the Firebase user', async () => {
      const rendered = await openDeleteAccount();

      await fireEvent.changeText(screen.getByLabelText('Password'), 'secret1');
      await fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

      expect(await screen.findByText('Sign in to continue.')).toBeOnTheScreen();
      expect(rendered.getPathname()).toBe('/sign-in');
      expect(firebaseAuth.reauthenticate).toHaveBeenCalledWith('secret1');
      const [[url]] = requestsWith('DELETE');
      expect(url).toEqual(new URL('/me', 'http://api.test'));
      // The API deletes first: once the Firebase user is gone, the app can't call it.
      const deleteCallOrder = jest.mocked(fetch).mock.invocationCallOrder.at(-1)!;
      expect(
        jest.mocked(firebaseAuth.deleteCurrentUser).mock.invocationCallOrder[0],
      ).toBeGreaterThan(deleteCallOrder);
    });

    it('deletes nothing when the password is wrong', async () => {
      jest
        .mocked(firebaseAuth.reauthenticate)
        .mockRejectedValueOnce(Object.assign(new Error(), { code: 'auth/invalid-credential' }));
      await openDeleteAccount();

      await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
      await fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

      expect(await screen.findByText('Password is incorrect.')).toBeOnTheScreen();
      expect(requestsWith('DELETE')).toHaveLength(0);
      expect(firebaseAuth.deleteCurrentUser).not.toHaveBeenCalled();
    });

    it('keeps the Firebase user when the API fails', async () => {
      await openDeleteAccount();
      jest.mocked(fetch).mockImplementationOnce(async () => new Response(null, { status: 500 }));

      await fireEvent.changeText(screen.getByLabelText('Password'), 'secret1');
      await fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

      expect(
        await screen.findByText(
          'Could not delete your account. Check your connection and try again.',
        ),
      ).toBeOnTheScreen();
      expect(firebaseAuth.deleteCurrentUser).not.toHaveBeenCalled();
    });
  });
});
