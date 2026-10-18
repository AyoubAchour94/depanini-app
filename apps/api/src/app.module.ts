import { Module } from '@nestjs/common';

import { AccountsModule } from './accounts/accounts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { EnvModule } from './config/env.module.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthModule } from './health/health.module.js';
import { TowRequestsModule } from './tow-requests/tow-requests.module.js';

@Module({
  imports: [EnvModule, DatabaseModule, AuthModule, HealthModule, AccountsModule, TowRequestsModule],
})
export class AppModule {}
