import { sql } from 'drizzle-orm';

import type { TripEvent } from '../src/realtime/event-bus.js';
import { LISTENER_APPLICATION_NAME, PgEventBus } from '../src/realtime/pg-event-bus.js';
import { connectTestDatabase, TEST_DATABASE_URL } from './support/test-database.js';

/** `PgEventBus` on its own: two "instances" on the test database, no Nest app. */
describe('PgEventBus (e2e)', () => {
  const database = connectTestDatabase();
  const buses: PgEventBus[] = [];

  /** A started bus that records what its subscriber gets. */
  const startBus = async (connectionString = TEST_DATABASE_URL) => {
    const bus = new PgEventBus(database.db, {
      connectionString,
      minBackoffMs: 20,
      maxBackoffMs: 200,
    });
    const received: TripEvent[] = [];
    bus.subscribe(async (event) => {
      received.push(event);
    });
    buses.push(bus);
    await bus.onApplicationBootstrap();
    return { bus, received };
  };

  /** Backend pids of this database's listeners. */
  const listenerPids = async () => {
    const { rows } = await database.db.execute<{ pid: number }>(
      sql`select pid from pg_stat_activity
          where datname = current_database() and application_name = ${LISTENER_APPLICATION_NAME}`,
    );
    return rows.map((row) => row.pid).sort();
  };

  afterEach(async () => {
    for (const bus of buses.splice(0)) await bus.onModuleDestroy();
  });

  afterAll(async () => {
    await database.close();
  });

  const moved = (driverId: string): TripEvent => ({ type: 'driver.moved', driverId });

  it('hands an event to the subscribers of every instance, once each', async () => {
    const a = await startBus();
    const b = await startBus();

    await a.bus.publish(moved('dan'));

    // Here at once: the publisher's own subscribers run before `publish` resolves.
    expect(a.received).toEqual([moved('dan')]);
    await vi.waitFor(() => expect(b.received).toEqual([moved('dan')]));
    // The publisher ignores its own notification, so nothing arrives twice.
    await b.bus.publish(moved('eve'));
    await vi.waitFor(() => expect(a.received).toEqual([moved('dan'), moved('eve')]));
    expect(b.received).toEqual([moved('dan'), moved('eve')]);
  });

  it('keeps the order of the events of one publisher', async () => {
    const a = await startBus();
    const b = await startBus();
    const events = Array.from({ length: 20 }, (_, i) => moved(`driver-${i}`));

    for (const event of events) await a.bus.publish(event);

    await vi.waitFor(() => expect(b.received).toEqual(events));
  });

  it('listens again after its connection drops', async () => {
    const a = await startBus();
    const b = await startBus();
    const before = await listenerPids();
    expect(before).toHaveLength(2);

    await database.db.execute(
      sql`select pg_terminate_backend(pid) from pg_stat_activity
          where datname = current_database() and application_name = ${LISTENER_APPLICATION_NAME}`,
    );

    // Each listener reconnects on new connections, and events flow again both ways.
    await vi.waitFor(
      async () => {
        const after = await listenerPids();
        expect(after).toHaveLength(2);
        expect(after.some((pid) => before.includes(pid))).toBe(false);
      },
      { timeout: 5_000 },
    );
    await vi.waitFor(
      async () => {
        await a.bus.publish(moved('dan'));
        expect(b.received).toContainEqual(moved('dan'));
      },
      { timeout: 5_000, interval: 100 },
    );
    await b.bus.publish(moved('eve'));
    await vi.waitFor(() => expect(a.received).toContainEqual(moved('eve')));
  });

  it('starts without the database and keeps retrying, still delivering locally', async () => {
    const unreachable = new URL(TEST_DATABASE_URL);
    unreachable.port = '1';
    const { bus, received } = await startBus(unreachable.toString());

    // Publishing still reaches this instance; only the NOTIFY to the others goes out.
    await bus.publish(moved('dan'));
    expect(received).toEqual([moved('dan')]);
  });

  it('delivers an event too large for NOTIFY locally, and does not throw', async () => {
    const a = await startBus();
    const b = await startBus();
    const huge: TripEvent = {
      type: 'requests.updated',
      ids: Array.from({ length: 300 }, () => crypto.randomUUID()),
    };

    await a.bus.publish(huge);
    await a.bus.publish(moved('dan'));

    expect(a.received).toEqual([huge, moved('dan')]);
    await vi.waitFor(() => expect(b.received).toEqual([moved('dan')]));
  });

  it('stops listening on shutdown', async () => {
    const { bus } = await startBus();
    expect(await listenerPids()).toHaveLength(1);
    await bus.onModuleDestroy();
    await vi.waitFor(async () => expect(await listenerPids()).toEqual([]));
  });
});
