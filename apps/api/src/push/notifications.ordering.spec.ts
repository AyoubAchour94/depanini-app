import type { Database } from '../db/database.module.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import type { DeviceTokens } from './device-tokens.service.js';
import { NotificationsService } from './notifications.service.js';
import type { PushSender } from './push-sender.js';

const A = '0d4d9a33-0a53-4d44-8a43-7ad2f3b6c1de';
const B = '5b1f6a60-6c3a-4f0e-9d0a-1c6c8a1f2e77';

/** Every request has a customer; every send for a request in `hung` never answers. */
function service(hung: string[], timeoutMs = 10_000) {
  const db = {
    select: () => ({
      from: () => ({
        where: async () => [{ id: 'x', customerId: 'customer', driverId: null }],
      }),
    }),
  };
  // The fake database answers the same row for every request, so the sender is told which.
  const sent: string[] = [];
  let current = '';
  const sender: PushSender = {
    send: (_tokens, message) => {
      sent.push(`${current}:${message.body}`);
      return hung.includes(current) ? new Promise<never>(() => {}) : Promise.resolve();
    },
  };
  const notifications = new NotificationsService(
    db as unknown as Database,
    () => new Date(),
    sender,
    { forUser: async () => ['token'] } as unknown as DeviceTokens,
    { isConnected: () => false } as unknown as RealtimeService,
    timeoutMs,
  );
  const change = (id: string, event: Parameters<NotificationsService['requestsChanged']>[1]) => {
    current = id;
    notifications.requestsChanged([id], event);
  };
  const chains = () => (notifications as unknown as { chains: Map<string, unknown> }).chains.size;
  return { notifications, sent, change, chains };
}

describe('NotificationsService ordering', () => {
  afterEach(() => vi.useRealTimers());

  it('does not let a hung send for one request hold back another request', async () => {
    const { sent, change } = service([A]);
    change(A, { type: 'completed' });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    change(B, { type: 'completed' });
    await vi.waitFor(() => expect(sent.map((s) => s.split(':')[0])).toEqual([A, B]));
  });

  it('gives up on a send after the timeout and goes on with the next push of that request', async () => {
    vi.useFakeTimers();
    const { notifications, sent, change } = service([A], 100);
    change(A, { type: 'stage', stage: 'en_route' });
    await vi.advanceTimersByTimeAsync(10);
    change(A, { type: 'stage', stage: 'arrived' });
    await vi.advanceTimersByTimeAsync(50);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(200);
    await notifications.flush();
  });

  it('keeps no chain once its jobs have settled', async () => {
    const { notifications, change, chains } = service([]);
    for (const id of [A, B, A]) change(id, { type: 'completed' });
    expect(chains()).toBe(2);
    await notifications.flush();
    expect(chains()).toBe(0);
  });
});
