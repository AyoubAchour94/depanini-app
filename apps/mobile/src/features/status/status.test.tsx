import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';

import { env } from '@/config/env';
import { createTestQueryClient } from '@/test/queryClient';

import { ApiHealthBadge } from './ApiHealthBadge';
import { FirebaseBanner } from './FirebaseBanner';

jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: undefined, environment: 'dev' },
}));

async function renderBadge() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ApiHealthBadge />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  env.apiUrl = undefined;
  jest.restoreAllMocks();
});

describe('ApiHealthBadge', () => {
  it('says so when no API URL is configured', async () => {
    await renderBadge();

    expect(await screen.findByText('API: EXPO_PUBLIC_API_URL not set')).toBeOnTheScreen();
  });

  it('shows the API status reported by GET /health', async () => {
    env.apiUrl = 'http://api.test';
    const body = { status: 'degraded', timestamp: new Date().toISOString(), db: 'down' };
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body, { status: 503 }));
    await renderBadge();

    expect(await screen.findByText('API: degraded (database down)')).toBeOnTheScreen();
    expect(fetch).toHaveBeenCalledWith(new URL('/health', 'http://api.test'), expect.anything());
  });

  it('reports the API as unreachable when the request fails', async () => {
    env.apiUrl = 'http://api.test';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network request failed'));
    await renderBadge();

    expect(await screen.findByText('API: unreachable')).toBeOnTheScreen();
  });
});

describe('FirebaseBanner', () => {
  it('shows the debug banner when Firebase is not configured', async () => {
    await render(<FirebaseBanner />);

    expect(await screen.findByText('Firebase not configured')).toBeOnTheScreen();
  });
});
