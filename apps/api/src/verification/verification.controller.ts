import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import {
  documentKindSchema,
  type DocumentKind,
  type DriverDocument,
  type Verification,
} from '@depanini/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AccountsService } from '../accounts/accounts.service.js';
import { type AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { detectContentType } from '../files/content-type.js';
import { VerificationService } from './verification.service.js';

/** `/driver/documents` and `/driver/verification` — a driver's documents and their check. */
@Controller('driver')
@UseGuards(FirebaseAuthGuard)
export class VerificationController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly verification: VerificationService,
  ) {}

  /**
   * Adds a page: `multipart/form-data` with a `kind` field and one `file` (JPEG, PNG or
   * PDF, up to 5 MiB). The type comes from the file's magic bytes; the filename is ignored.
   * `415` for another type (or one that differs from the declared type), `413` for a
   * file that is too large.
   */
  @Post('documents')
  async upload(@Req() request: AuthenticatedRequest & FastifyRequest): Promise<DriverDocument> {
    const driverId = await this.driverId(request);
    const { kind, bytes, declaredType } = await readUpload(request);
    const contentType = detectContentType(bytes);
    if (!contentType || (declaredType !== undefined && declaredType !== contentType)) {
      throw new UnsupportedMediaTypeException('Upload a JPEG, PNG or PDF file');
    }
    return this.verification.addPage(driverId, kind, contentType, bytes);
  }

  /** Deletes a page, while the documents are `unsubmitted` or `rejected`. */
  @Delete('documents/:id')
  @HttpCode(204)
  async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    if (!z.uuid().safeParse(id).success) throw new NotFoundException('Document not found');
    await this.verification.deletePage(await this.driverId(request), id);
  }

  @Get('verification')
  async get(@Req() request: AuthenticatedRequest): Promise<Verification> {
    return this.verification.get(await this.driverId(request));
  }

  /** Sends the documents for review; `409` until every kind has a page. */
  @Post('verification/submit')
  @HttpCode(200)
  async submit(@Req() request: AuthenticatedRequest): Promise<Verification> {
    return this.verification.submit(await this.driverId(request));
  }

  /** The signed-in account's id, if it has a driver profile (`403` otherwise). */
  private async driverId(request: AuthenticatedRequest): Promise<string> {
    const account = await this.accounts.getOrCreateWithProfiles({
      firebaseUid: request.user.uid,
      email: request.user.email,
    });
    if (!account.driverProfile) throw new ForbiddenException('Complete your driver profile first');
    return account.id;
  }
}

/** Reads the `kind` field and the single `file` of an upload, within the size limit. */
async function readUpload(
  request: FastifyRequest,
): Promise<{ kind: DocumentKind; bytes: Buffer; declaredType?: string }> {
  if (!request.isMultipart()) {
    throw new BadRequestException('Send multipart/form-data with a kind and a file');
  }
  let kind: unknown;
  let bytes: Buffer | undefined;
  let declaredType: string | undefined;
  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file' || bytes) {
          throw new BadRequestException('Send exactly one file, in the "file" field');
        }
        declaredType = part.mimetype;
        bytes = await part.toBuffer();
      } else if (part.fieldname === 'kind') {
        kind = part.value;
      }
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new PayloadTooLargeException('The file is too large (5 MB at most)');
    }
    if (code === 'FST_FILES_LIMIT') {
      throw new BadRequestException('Send exactly one file, in the "file" field');
    }
    if (code?.startsWith('FST_')) throw new BadRequestException('Malformed upload');
    throw error;
  }
  const parsedKind = documentKindSchema.safeParse(kind);
  if (!parsedKind.success) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Validation failed',
      issues: [{ path: ['kind'], message: 'Invalid document kind' }],
    });
  }
  if (!bytes) throw new BadRequestException('Send exactly one file, in the "file" field');
  return { kind: parsedKind.data, bytes, declaredType };
}
