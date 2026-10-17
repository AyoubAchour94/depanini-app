import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { EnvModule } from './config/env.module.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [EnvModule, DatabaseModule, AuthModule, HealthModule],
})
export class AppModule {}
