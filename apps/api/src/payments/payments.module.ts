import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { TowRequestsModule } from '../tow-requests/tow-requests.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [AccountsModule, TowRequestsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
