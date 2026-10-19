import type { Database } from '../db/database.module.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import type { DeviceTokens } from './device-tokens.service.js';
import { NotificationsService, SHUTDOWN_FLUSH_MS } from './notifications.service.js';
import type { PushSender } from './push-sender.js';

const requestId = '4a4cbd7c-6cb8-4a6a-8f4d-3a8d7b0cf2f1';

/** A service whose database never answers, so a push started on it never finishes. */
function stuckService() {
  const db = { select: () => ({ from: () => ({ where: () => new Promise<never>(() => {}) }) }) };
  const sender: PushSender = { send: async () => undefined };
  return new NotificationsService(
    db as unknown as Database,
    () => new Date(),
    sender,
    {} as DeviceTokens,
    {} as RealtimeService,
  );
}

describe('NotificationsService shutdown', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for the pushes on their way, but not longer than the cap', async () => {
    vi.useFakeTimers();
    const service = stuckService();
    service.requestsChanged([requestId], { type: 'completed' });

    let done = false;
    const shutdown = service.onApplicationShutdown().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(SHUTDOWN_FLUSH_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await shutdown;
    expect(done).toBe(true);
  });

  it('returns at once when nothing is pending', async () => {
    await stuckService().onApplicationShutdown();
  });
});
