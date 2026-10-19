import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { FilesModule } from '../files/files.module.js';
import { TowRequestsModule } from '../tow-requests/tow-requests.module.js';
import { AdminDriversService } from './admin-drivers.service.js';
import { AdminLookupsService } from './admin-lookups.service.js';
import { AdminQueuesService } from './admin-queues.service.js';
import { AdminController } from './admin.controller.js';

/** The admin API (`/admin/*`), for the admin app. */
@Module({
  imports: [AccountsModule, FilesModule, TowRequestsModule],
  controllers: [AdminController],
  providers: [AdminDriversService, AdminLookupsService, AdminQueuesService],
})
export class AdminModule {}
