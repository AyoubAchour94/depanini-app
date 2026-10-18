import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook } from '@testing-library/react-native';

import { useAuth } from '@/auth/AuthProvider';
import { createTestQueryClient } from '@/test/queryClient';

import { LiveIndicator } from './LiveIndicator';
import { RealtimeProvider } from './RealtimeProvider';
import { LIVE_POLL_MS, usePollMs } from './status';

jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({ env: { apiUrl: 'https://api.test', environment: 'dev' } }));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('@/features/driver/usePresence', () => {
  let truck: unknown = { latitude: 36.8, longitude: 10.18 };
  return {
    resetTruckLocation: () => {
      truck = null;
    },
    getTruckLocationForTest: () => truck,
    setTruckLocationForTest: (value: unknown) => {
      truck = value;
    },
  };
});

const sockets: FakeSocket[] = [];
class FakeSocket {
  sent: string[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: unknown }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  constructor(readonly url: string) {
    sockets.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
}

const { getTruckLocationForTest, setTruckLocationForTest } = jest.requireMock(
  '@/features/driver/usePresence',
) as {
  getTruckLocationForTest: () => unknown;
  setTruckLocationForTest: (value: unknown) => void;
};
const mockedAuth = useAuth as jest.Mock;
const signedIn = (uid: string) => ({ status: 'signed-in', user: { uid, email: null } });

function providerTree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <RealtimeProvider>
        <LiveIndicator live="Live" reconnecting="Reconnecting…" />
      </RealtimeProvider>
    </QueryClientProvider>
  );
}
const client = createTestQueryClient();
const renderProvider = async () => await render(providerTree(client));

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
};

beforeEach(() => {
  sockets.length = 0;
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
});

describe('RealtimeProvider', () => {
  it('connects when signed in, goes live after auth.ok and polls slowly then', async () => {
    mockedAuth.mockReturnValue(signedIn('u1'));
    const screen = await renderProvider();
    const poll = await renderHook(() => usePollMs(5_000));
    await flush();
    expect(sockets[0]!.url).toBe('wss://api.test/ws');
    await act(async () => sockets[0]!.onopen?.());
    expect(JSON.parse(sockets[0]!.sent[0]!)).toEqual({ type: 'auth', token: 'id-token' });
    expect(screen.getByText('Reconnecting…')).toBeTruthy();
    expect(poll.result.current).toBe(5_000);

    await act(async () => sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'auth.ok' }) }));
    expect(screen.getByText('Live')).toBeTruthy();
    expect(poll.result.current).toBe(LIVE_POLL_MS);

    await act(async () => sockets[0]!.onclose?.({ code: 1006 }));
    expect(screen.getByText('Reconnecting…')).toBeTruthy();
    expect(poll.result.current).toBe(5_000);
  });

  it('does not connect when signed out, and forgets the truck position', async () => {
    mockedAuth.mockReturnValue({ status: 'signed-out' });
    setTruckLocationForTest({ latitude: 36.8, longitude: 10.18 });
    await renderProvider();
    await flush();
    expect(sockets).toHaveLength(0);
    expect(getTruckLocationForTest()).toBeNull();
  });

  it('forgets the truck position and reconnects when the user changes', async () => {
    mockedAuth.mockReturnValue(signedIn('u1'));
    const screen = await renderProvider();
    await flush();
    setTruckLocationForTest({ latitude: 36.8, longitude: 10.18 });
    mockedAuth.mockReturnValue(signedIn('u2'));
    await screen.rerender(providerTree(client));
    await flush();
    expect(getTruckLocationForTest()).toBeNull();
    expect(sockets).toHaveLength(2);
  });
});
