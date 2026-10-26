import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createTestQueryClient } from '@/test/queryClient';

import { useTowRequest } from './towRequests';

jest.mock('@/config/env', () => ({ env: { apiUrl: 'http://api.test' } }));
jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'tok' }));
jest.mock('@/realtime/status', () => ({ usePollMs: (ms: number) => ms }));

describe('query cancellation', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('aborts the in-flight request when its query is cancelled', async () => {
    let seen: AbortSignal | null | undefined;
    global.fetch = jest.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          seen = init?.signal;
          seen?.addEventListener('abort', () =>
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
          );
        }),
    ) as unknown as typeof fetch;
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    await renderHook(() => useTowRequest('7f9c2f0e-6c1d-4a8e-9b53-0d5d3a1c2b4e'), { wrapper });
    await waitFor(() => expect(seen).toBeTruthy());
    expect(seen?.aborted).toBe(false);

    await client.cancelQueries();

    await waitFor(() => expect(seen?.aborted).toBe(true));
  });
});
