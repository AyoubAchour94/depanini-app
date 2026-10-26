import { randomUUID } from 'node:crypto';

import { Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { z } from 'zod';

import type { Database } from '../db/database.module.js';
import {
  type EventBus,
  type TripEvent,
  type TripEventHandler,
  tripEventSchema,
} from './event-bus.js';

/** The Postgres channel the instances notify each other on. */
export const EVENT_CHANNEL = 'depanini_trip_events';

/** `application_name` of the listening connections, to spot them in `pg_stat_activity`. */
export const LISTENER_APPLICATION_NAME = 'depanini-realtime';

/** Postgres refuses a NOTIFY payload of 8000 bytes or more. */
const MAX_PAYLOAD_BYTES = 7999;

export interface PgEventBusOptions {
  /** The database to listen on; the same one the instances write to. */
  connectionString: string;
  /** First wait before listening again after the connection drops; doubles each failure. */
  minBackoffMs: number;
  /** Longest wait between two attempts. */
  maxBackoffMs: number;
}

export const DEFAULT_BACKOFF = { minBackoffMs: 500, maxBackoffMs: 30_000 };

const notificationSchema = z.object({ origin: z.string(), event: tripEventSchema });

/**
 * {@link EventBus} over Postgres `LISTEN/NOTIFY`, so several API instances on one database
 * tell each other's sockets.
 *
 * `publish` runs this instance's subscribers directly, then sends `pg_notify` through the
 * pool. Each instance holds one dedicated connection (outside the pool) that LISTENs and
 * runs its subscribers for the others' events, in the order they were sent; its own come
 * back too and are skipped by their `origin`. When that connection drops it reconnects with
 * backoff; events sent meanwhile are lost to this instance, which the apps' polling covers.
 */
export class PgEventBus implements EventBus, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PgEventBus.name);
  /** Tells this instance's notifications from the others'. */
  private readonly origin = randomUUID();
  private readonly handlers: TripEventHandler[] = [];
  /** Clients that dropped and were already handled. */
  private readonly dropped = new WeakSet<pg.Client>();
  private client?: pg.Client;
  private retry?: NodeJS.Timeout;
  private failures = 0;
  private stopped = false;
  /** Events from other instances, handled one after another. */
  private queue = Promise.resolve();

  constructor(
    private readonly db: Database,
    private readonly options: PgEventBusOptions,
  ) {}

  subscribe(handler: TripEventHandler): void {
    this.handlers.push(handler);
  }

  async publish(event: TripEvent): Promise<void> {
    await this.deliver(event);
    const payload = JSON.stringify({ origin: this.origin, event });
    if (Buffer.byteLength(payload) > MAX_PAYLOAD_BYTES) {
      this.logger.warn(`Not sending ${event.type} to other instances: too large for NOTIFY`);
      return;
    }
    await this.db.execute(sql`select pg_notify(${EVENT_CHANNEL}, ${payload})`);
  }

  /** Listens before the app serves; if the database is not there yet it keeps trying. */
  async onApplicationBootstrap(): Promise<void> {
    await this.listen();
  }

  /** Stops listening first, so nothing arrives while the rest of the app shuts down. */
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retry);
    const client = this.client;
    this.client = undefined;
    if (client) {
      this.dropped.add(client);
      try {
        await client.query(`UNLISTEN ${EVENT_CHANNEL}`);
      } catch {
        // Ending the connection unlistens too.
      }
      await client.end().catch(() => undefined);
    }
    await this.queue;
  }

  private async listen(): Promise<void> {
    const client = new pg.Client({
      connectionString: this.options.connectionString,
      application_name: LISTENER_APPLICATION_NAME,
    });
    client.on('notification', ({ payload }) => this.receive(payload));
    // Unhandled, a connection error would crash the process.
    client.on('error', (error) => this.drop(client, error));
    client.on('end', () => this.drop(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${EVENT_CHANNEL}`);
    } catch (error) {
      this.drop(client, error as Error);
      return;
    }
    if (this.stopped || this.dropped.has(client)) {
      await client.end().catch(() => undefined);
      return;
    }
    if (this.failures > 0) this.logger.log('Listening for other instances again');
    this.client = client;
    this.failures = 0;
  }

  /** Forgets a dead connection and listens again after a backoff. */
  private drop(client: pg.Client, error?: Error): void {
    if (this.dropped.has(client)) return;
    this.dropped.add(client);
    if (this.client === client) this.client = undefined;
    client.end().catch(() => undefined);
    if (this.stopped) return;
    const { minBackoffMs, maxBackoffMs } = this.options;
    const delay = Math.min(maxBackoffMs, minBackoffMs * 2 ** this.failures);
    this.failures += 1;
    this.logger.warn(
      `Lost the connection that listens for other instances (${describe(error)}); retrying in ${delay} ms`,
    );
    this.retry = setTimeout(() => void this.listen(), delay);
  }

  private receive(payload: string | undefined): void {
    const parsed = parseNotification(payload);
    if (!parsed) {
      this.logger.warn(`Ignoring a malformed notification on ${EVENT_CHANNEL}`);
      return;
    }
    if (parsed.origin === this.origin) return;
    this.queue = this.queue.then(() => this.deliver(parsed.event));
  }

  private async deliver(event: TripEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.warn(`Could not handle ${event.type}: ${(error as Error).message}`);
      }
    }
  }
}

/** A connection refused on several addresses is an `AggregateError` with no message. */
function describe(error: Error | undefined): string {
  if (!error) return 'closed';
  return error.message || (error as NodeJS.ErrnoException).code || error.name;
}

function parseNotification(payload: string | undefined) {
  try {
    const parsed = notificationSchema.safeParse(JSON.parse(payload ?? ''));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
