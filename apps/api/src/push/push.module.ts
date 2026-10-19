import { Global, Module } from '@nestjs/common';
import { getMessaging } from 'firebase-admin/messaging';

import { AccountsModule } from '../accounts/accounts.module.js';
import { firebaseApp } from '../auth/firebase-app.js';
import type { Env } from '../config/env.js';
import { ENV } from '../config/env.module.js';
import { TowRequestsModule } from '../tow-requests/tow-requests.module.js';
import { DeviceTokens } from './device-tokens.service.js';
import { DevicesController } from './devices.controller.js';
import { FcmPushSender } from './fcm-push-sender.js';
import { LogPushSender } from './log-push-sender.js';
import { NotificationsService } from './notifications.service.js';
import { PUSH_SENDER, type PushSender } from './push-sender.js';
import { PushInboxController } from './push-inbox.controller.js';

/**
 * Device tokens and push notifications. Global, so {@link TripEvents} can hand the
 * after-commit changes to {@link NotificationsService}. `PUSH_PROVIDER` picks the sender.
 */
@Global()
@Module({
  imports: [AccountsModule, TowRequestsModule],
  controllers: [DevicesController, PushInboxController],
  providers: [
    DeviceTokens,
    NotificationsService,
    {
      provide: PUSH_SENDER,
      inject: [ENV, DeviceTokens],
      useFactory: (env: Env, tokens: DeviceTokens): PushSender =>
        env.PUSH_PROVIDER === 'fcm'
          ? new FcmPushSender(getMessaging(firebaseApp(env)), (dead) => tokens.remove(dead))
          : new LogPushSender(),
    },
  ],
  exports: [NotificationsService],
})
export class PushModule {}
