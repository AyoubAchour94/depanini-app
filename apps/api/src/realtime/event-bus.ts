import { z } from 'zod';

/**
 * Something that changed in a trip, as the ids it touched. Each API instance reads the
 * rows back itself and tells its own sockets, so an event stays small whatever it is about.
 */
export const tripEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('requests.updated'), ids: z.array(z.string()) }),
  z.object({ type: z.literal('offers.updated'), ids: z.array(z.string()) }),
  z.object({ type: z.literal('driver.moved'), driverId: z.string() }),
  z.object({ type: z.literal('nearby.changed'), requestIds: z.array(z.string()) }),
]);
export type TripEvent = z.infer<typeof tripEventSchema>;

export type TripEventHandler = (event: TripEvent) => Promise<void>;

/**
 * Carries {@link TripEvent}s between the API instances (Postgres `NOTIFY` today, see
 * `PgEventBus`; another transport, e.g. Redis, can replace it behind this interface).
 */
export interface EventBus {
  /**
   * Hands `event` to the subscribers of every instance, this one included. Resolves once
   * this instance's subscribers are done and the event is on its way to the others.
   */
  publish(event: TripEvent): Promise<void>;
  /** Runs `handler` for every event, from this instance or another, one at a time. */
  subscribe(handler: TripEventHandler): void;
}

/** Injection token for the {@link EventBus}. */
export const EVENT_BUS = Symbol('EVENT_BUS');
