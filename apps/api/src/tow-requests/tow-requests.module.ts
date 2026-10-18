import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { CLOCK, type Clock } from './clock.js';
import { TowRequestsController } from './tow-requests.controller.js';
import { TowRequestsService } from './tow-requests.service.js';

@Module({
  imports: [AccountsModule],
  controllers: [TowRequestsController],
  providers: [{ provide: CLOCK, useValue: (() => new Date()) satisfies Clock }, TowRequestsService],
  exports: [CLOCK],
})
export class TowRequestsModule {}
