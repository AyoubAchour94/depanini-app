import { QueryClient } from '@tanstack/react-query';

const clients = new Set<QueryClient>();

// Registered once per test file that imports this module.
afterEach(() => {
  for (const client of clients) client.clear();
  clients.clear();
});

/**
 * A QueryClient for tests: no retries, and no garbage-collection timers.
 * Mutations default to a 5 minute `gcTime` that keeps Jest alive after the
 * tests finish, so it is disabled here too. Cleared after every test.
 */
export function createTestQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { gcTime: Infinity, retry: false },
    },
  });
  clients.add(client);
  return client;
}
