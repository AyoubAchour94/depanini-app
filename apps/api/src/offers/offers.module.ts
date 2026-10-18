import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { TowRequestsModule } from '../tow-requests/tow-requests.module.js';
import { OffersController } from './offers.controller.js';
import { OffersService } from './offers.service.js';

@Module({
  imports: [AccountsModule, TowRequestsModule],
  controllers: [OffersController],
  providers: [OffersService],
})
export class OffersModule {}
