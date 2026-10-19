import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { unregisterPush } from '@/push';
import { createTestQueryClient } from '@/test/queryClient';

import { signOut } from './firebase-auth';
import { useSignOut } from './useSignOut';

jest.mock('./firebase-auth', () => ({ signOut: jest.fn(async () => {}) }));
jest.mock('@/push', () => ({ unregisterPush: jest.fn(async () => {}) }));

describe('useSignOut', () => {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => jest.clearAllMocks());

  it('removes the push token before signing out, then clears the cache', async () => {
    const order: string[] = [];
    jest.mocked(unregisterPush).mockImplementationOnce(async () => void order.push('unregister'));
    jest.mocked(signOut).mockImplementationOnce(async () => void order.push('signOut'));
    client.setQueryData(['me'], { id: 1 });
    const { result } = await renderHook(() => useSignOut(), { wrapper });

    await act(async () => result.current.mutateAsync());

    expect(order).toEqual(['unregister', 'signOut']);
    expect(client.getQueryData(['me'])).toBeUndefined();
  });
});
