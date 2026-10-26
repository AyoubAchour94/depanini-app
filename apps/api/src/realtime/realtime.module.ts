import { Global, Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import type { Env } from '../config/env.js';
import { ENV } from '../config/env.module.js';
import { DB, type Database } from '../db/database.module.js';
import { TowRequestsModule } from '../tow-requests/tow-requests.module.js';
import { EVENT_BUS } from './event-bus.js';
import { DEFAULT_BACKOFF, PgEventBus } from './pg-event-bus.js';
import { DEFAULT_REALTIME_OPTIONS, REALTIME_OPTIONS, RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';
import { TripEvents } from './trip-events.service.js';

/**
 * The `/ws` endpoint and the events services publish on it. Global, so the services
 * that change trips can inject {@link TripEvents} and push can ask who is connected. Needs `WsAdapter` on the app (see `main.ts`).
 * Events travel between API instances over Postgres `LISTEN/NOTIFY` ({@link PgEventBus}).
 */
@Global()
@Module({
  imports: [AccountsModule, TowRequestsModule],
  providers: [
    { provide: REALTIME_OPTIONS, useValue: DEFAULT_REALTIME_OPTIONS },
    {
      provide: EVENT_BUS,
      inject: [ENV, DB],
      useFactory: (env: Env, db: Database) =>
        new PgEventBus(db, {
          connectionString: env.DATABASE_LISTEN_URL ?? env.DATABASE_URL,
          ...DEFAULT_BACKOFF,
        }),
    },
    RealtimeService,
    TripEvents,
    RealtimeGateway,
  ],
  exports: [TripEvents, RealtimeService],
})
export class RealtimeModule {}
