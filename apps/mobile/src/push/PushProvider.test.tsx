import type { PushData } from '@depanini/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { router } from 'expo-router';

import { JOB_KEY, NEARBY_KEY } from '@/api/driver';
import { useMe } from '@/api/me';
import { useAuth } from '@/auth/AuthProvider';
import { createTestQueryClient } from '@/test/queryClient';
import { variant } from '@/variant/variant';

import { registerForPush, setPushUser, subscribePushTaps, watchPushToken } from '.';
import { PushProvider } from './PushProvider';

jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
jest.mock('.', () => ({
  registerForPush: jest.fn(async () => {}),
  setPushUser: jest.fn(),
  subscribePushTaps: jest.fn(() => jest.fn()),
  watchPushToken: jest.fn(() => jest.fn()),
}));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('@/api/me', () => ({ useMe: jest.fn() }));
jest.mock('@/variant/variant', () => ({
  variant: { variant: 'user', isDriverApp: false },
}));

const requestId = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';
const offerId = '0f3d9a52-8c1e-4b7a-a2d4-6e5f4c3b2a10';

const mockedAuth = jest.mocked(useAuth);
const mockedMe = jest.mocked(useMe);
const navigate = jest.mocked(router.navigate);
const mutableVariant = variant as { isDriverApp: boolean };

const signedIn = { status: 'signed-in', user: { uid: 'u1', email: null } } as const;
const profiled = { data: { customerProfile: {}, driverProfile: {} } } as never;
const noAccount = { data: undefined } as never;

/** Mounts the provider; `tap` is what the app sees when a notification is tapped. */
async function mount() {
  const client = createTestQueryClient();
  // A fresh element each time, or React skips the re-render.
  const ui = () => (
    <QueryClientProvider client={client}>
      <PushProvider>{null}</PushProvider>
    </QueryClientProvider>
  );
  const view = await render(ui());
  const tap = async (data: PushData) => {
    const [onTap] = jest.mocked(subscribePushTaps).mock.calls.at(-1)!;
    await act(async () => onTap(data));
  };
  return { client, tap, rerender: () => view.rerender(ui()) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mutableVariant.isDriverApp = false;
  mockedAuth.mockReturnValue(signedIn);
  mockedMe.mockReturnValue(profiled);
});

describe('registration', () => {
  it('tells the push module who is signed in and registers silently once the account loads', async () => {
    await mount();

    expect(setPushUser).toHaveBeenCalledWith('u1');
    expect(watchPushToken).toHaveBeenCalled();
    expect(registerForPush).toHaveBeenCalledWith({ prompt: false });
  });

  it('does not register before the account exists on the API', async () => {
    mockedMe.mockReturnValue(noAccount);
    await mount();

    expect(registerForPush).not.toHaveBeenCalled();
  });

  it('does nothing while signed out', async () => {
    mockedAuth.mockReturnValue({ status: 'signed-out' });
    mockedMe.mockReturnValue(noAccount);
    await mount();

    expect(setPushUser).toHaveBeenCalledWith(null);
    expect(watchPushToken).not.toHaveBeenCalled();
    expect(registerForPush).not.toHaveBeenCalled();
  });
});

describe('tap routing', () => {
  it('opens the active request for a customer', async () => {
    const { tap } = await mount();

    await tap({ kind: 'trip_stage', requestId });

    expect(navigate).toHaveBeenCalledWith('/request/active');
  });

  it('waits for the account before navigating (cold start)', async () => {
    mockedMe.mockReturnValue(noAccount);
    const { tap, rerender } = await mount();

    await tap({ kind: 'offer_received', requestId });
    expect(navigate).not.toHaveBeenCalled();

    mockedMe.mockReturnValue(profiled);
    await rerender();
    expect(navigate).toHaveBeenCalledWith('/request/active');
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('drops a tap made before signing out', async () => {
    mockedMe.mockReturnValue(noAccount);
    const { tap, rerender } = await mount();
    await tap({ kind: 'offer_received', requestId });

    mockedAuth.mockReturnValue({ status: 'signed-out' });
    await rerender();
    mockedAuth.mockReturnValue(signedIn);
    mockedMe.mockReturnValue(profiled);
    await rerender();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores a kind the app has no screen for', async () => {
    const { tap } = await mount();

    await tap({ kind: 'nearby_request', requestId });

    expect(navigate).not.toHaveBeenCalled();
  });

  describe('driver app', () => {
    beforeEach(() => {
      mutableVariant.isDriverApp = true;
    });

    it('opens a nearby request that is cached', async () => {
      const { tap, client } = await mount();
      client.setQueryData(NEARBY_KEY, [{ id: requestId }]);

      await tap({ kind: 'nearby_request', requestId });

      expect(navigate).toHaveBeenCalledWith({
        pathname: '/job-offer/[id]',
        params: { id: requestId },
      });
    });

    it('goes home when the nearby request is not cached', async () => {
      const { tap } = await mount();

      await tap({ kind: 'nearby_request', requestId });

      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('goes home with a notice when an open request under an offer was cancelled', async () => {
      const { tap } = await mount();

      await tap({ kind: 'trip_cancelled', requestId, offerId });

      expect(navigate).toHaveBeenCalledWith({
        pathname: '/',
        params: { notice: 'request-cancelled' },
      });
    });

    it('opens the job for a cancel while the driver has one', async () => {
      const { tap, client } = await mount();
      client.setQueryData(JOB_KEY, { id: requestId });

      await tap({ kind: 'trip_cancelled', requestId, offerId });

      expect(navigate).toHaveBeenCalledWith('/job');
    });
  });
});
