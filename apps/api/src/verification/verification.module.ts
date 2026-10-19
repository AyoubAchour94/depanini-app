import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { FilesModule } from '../files/files.module.js';
import { TowRequestsModule } from '../tow-requests/tow-requests.module.js';
import { VerificationController } from './verification.controller.js';
import { VerificationService } from './verification.service.js';

@Module({
  imports: [AccountsModule, FilesModule, TowRequestsModule],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
