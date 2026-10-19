import { Global, Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { TowRequestsModule } from '../tow-requests/tow-requests.module.js';
import { DEFAULT_REALTIME_OPTIONS, REALTIME_OPTIONS, RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';
import { TripEvents } from './trip-events.service.js';

/**
 * The `/ws` endpoint and the events services publish on it. Global, so the services
 * that change trips can inject {@link TripEvents} and push can ask who is connected. Needs `WsAdapter` on the app (see `main.ts`).
 */
@Global()
@Module({
  imports: [AccountsModule, TowRequestsModule],
  providers: [
    { provide: REALTIME_OPTIONS, useValue: DEFAULT_REALTIME_OPTIONS },
    RealtimeService,
    TripEvents,
    RealtimeGateway,
  ],
  exports: [TripEvents, RealtimeService],
})
export class RealtimeModule {}
