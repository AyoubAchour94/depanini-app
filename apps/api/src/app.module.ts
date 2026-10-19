import { Module } from '@nestjs/common';

import { AccountsModule } from './accounts/accounts.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { EnvModule } from './config/env.module.js';
import { DatabaseModule } from './db/database.module.js';
import { DriversModule } from './drivers/drivers.module.js';
import { FilesModule } from './files/files.module.js';
import { HealthModule } from './health/health.module.js';
import { OffersModule } from './offers/offers.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PushModule } from './push/push.module.js';
import { RatingsModule } from './ratings/ratings.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { TowRequestsModule } from './tow-requests/tow-requests.module.js';
import { VerificationModule } from './verification/verification.module.js';

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    AuthModule,
    HealthModule,
    AccountsModule,
    TowRequestsModule,
    DriversModule,
    OffersModule,
    PaymentsModule,
    RatingsModule,
    ReportsModule,
    PushModule,
    RealtimeModule,
    FilesModule,
    VerificationModule,
    AdminModule,
  ],
})
export class AppModule {}
