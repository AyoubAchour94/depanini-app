import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { TowRequestsModule } from '../tow-requests/tow-requests.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [AccountsModule, TowRequestsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
