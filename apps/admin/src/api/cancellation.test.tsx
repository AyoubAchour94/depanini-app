import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApiProvider } from './ApiProvider';
import type { ApiClient } from './client';
import { useUser } from './lookups';

describe('query cancellation', () => {
  it('passes the query signal to the API client, which is aborted when the query is cancelled', async () => {
    let seen: AbortSignal | undefined;
    const api = {
      get: vi.fn((_path: string, _schema: unknown, options?: { signal?: AbortSignal }) => {
        seen = options?.signal;
        return new Promise(() => {});
      }),
    } as unknown as ApiClient;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider client={api}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </ApiProvider>
    );
    renderHook(() => useUser('u1'), { wrapper });
    await waitFor(() => expect(seen).toBeDefined());
    expect(seen?.aborted).toBe(false);

    await client.cancelQueries();

    expect(seen?.aborted).toBe(true);
  });
});
