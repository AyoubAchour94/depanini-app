import { Module } from '@nestjs/common';

import { AccountsService } from './accounts.service.js';
import { MeController } from './me.controller.js';

@Module({
  controllers: [MeController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
