import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { TowRequestsModule } from '../tow-requests/tow-requests.module.js';
import { DriversController } from './drivers.controller.js';
import { DriversService } from './drivers.service.js';

@Module({
  imports: [AccountsModule, TowRequestsModule],
  controllers: [DriversController],
  providers: [DriversService],
})
export class DriversModule {}
