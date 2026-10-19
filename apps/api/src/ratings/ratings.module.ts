import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { TowRequestsModule } from '../tow-requests/tow-requests.module.js';
import { RatingsController } from './ratings.controller.js';
import { RatingsService } from './ratings.service.js';

@Module({
  imports: [AccountsModule, TowRequestsModule],
  controllers: [RatingsController],
  providers: [RatingsService],
})
export class RatingsModule {}
