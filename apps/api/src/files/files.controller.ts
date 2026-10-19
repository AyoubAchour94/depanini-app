import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { AccountsService } from '../accounts/accounts.service.js';
import { type AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { FILE_STORE, type FileStore } from './file-store.js';

/**
 * `GET /files/:id` streams the bytes straight from the API, for the signed-in owner
 * only (admins join in the admin slice). Clients fetch it with their ID token as a
 * blob, so there are no signed URLs to leak or expire. Anyone else gets `404`, as for
 * a file that does not exist.
 */
@Controller('files')
@UseGuards(FirebaseAuthGuard)
export class FilesController {
  constructor(
    private readonly accounts: AccountsService,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  @Get(':id')
  async download(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!z.uuid().safeParse(id).success) throw new NotFoundException('File not found');
    const account = await this.accounts.getOrCreate({
      firebaseUid: request.user.uid,
      email: request.user.email,
    });
    const file = await this.store.get(id);
    if (!file || file.ownerUserId !== account.id) throw new NotFoundException('File not found');
    await reply
      .headers({
        'Content-Type': file.contentType,
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      })
      .send(file.data);
  }
}
