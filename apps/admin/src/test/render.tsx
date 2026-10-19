import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { ApiProvider } from '../api/ApiProvider';
import type { ApiClient } from '../api/client';
import { App } from '../App';
import { AuthProvider } from '../auth/AuthProvider';
import type { AuthService } from '../auth/service';

/** Renders the whole app against a fake auth service and API, at `route`. */
export function renderApp({
  auth,
  api,
  route = '/',
}: {
  auth: AuthService;
  api: ApiClient;
  route?: string;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthProvider service={auth}>
      <ApiProvider client={api}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>
            <App />
          </MemoryRouter>
        </QueryClientProvider>
      </ApiProvider>
    </AuthProvider>,
  );
}
