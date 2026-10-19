import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { FILE_STORE } from './file-store.js';
import { FilesController } from './files.controller.js';
import { PostgresFileStore } from './postgres-file-store.js';

@Module({
  imports: [AccountsModule],
  controllers: [FilesController],
  providers: [{ provide: FILE_STORE, useClass: PostgresFileStore }],
  exports: [FILE_STORE],
})
export class FilesModule {}
