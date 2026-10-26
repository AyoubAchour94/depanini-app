import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DOCUMENT_KINDS,
  type DocumentKind,
  type DriverDocument,
  UPLOAD_LIMIT_REACHED,
  type UploadContentType,
  type Verification,
} from '@depanini/shared';
import { and, asc, eq, gt, sql } from 'drizzle-orm';

import type { Env } from '../config/env.js';
import { ENV } from '../config/env.module.js';
import { DB, type Database } from '../db/database.module.js';
import { documentUploads, driverDocuments, driverProfiles, files } from '../db/schema.js';
import { FILE_STORE, type FileStore } from '../files/file-store.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';
import { isUniqueViolation } from '../tow-requests/tow-requests.service.js';

/** The most pages one document may have. */
export const MAX_PAGES_PER_KIND = 10;

/** Statuses in which the driver may still change their documents. */
const EDITABLE = ['unsubmitted', 'rejected'];

const documentColumns = {
  id: driverDocuments.id,
  kind: driverDocuments.kind,
  page: driverDocuments.page,
  contentType: files.contentType,
  sizeBytes: files.sizeBytes,
  createdAt: driverDocuments.createdAt,
};

/** The driver's pages, by kind then page number. Also what admins review. */
export async function listDocuments(
  db: Pick<Database, 'select'>,
  driverId: string,
): Promise<DriverDocument[]> {
  const rows = await db
    .select(documentColumns)
    .from(driverDocuments)
    .innerJoin(files, eq(files.id, driverDocuments.fileId))
    .where(eq(driverDocuments.driverUserId, driverId))
    .orderBy(asc(driverDocuments.kind), asc(driverDocuments.page));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/** A driver's documents and their check. Drivers need a driver profile. */
@Injectable()
export class VerificationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(FILE_STORE) private readonly store: FileStore,
    @Inject(CLOCK) private readonly now: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * The per-driver upload limit: `429 { code: UPLOAD_LIMIT_REACHED }` once the driver has
   * `UPLOAD_LIMIT_PER_HOUR` uploads from the last hour, or `UPLOAD_LIMIT_PER_DAY` from the
   * last day. Counted from the append-only `document_uploads` log in Postgres (deleting a page does not free a slot), so it holds across API instances.
   */
  async assertCanUpload(driverId: string, db: Pick<Database, 'select'> = this.db): Promise<void> {
    const [counts] = await db
      .select({
        lastHour: sql<number>`(count(*) filter (where ${documentUploads.createdAt} > now() - interval '1 hour'))::int`,
        lastDay: sql<number>`count(*)::int`,
      })
      .from(documentUploads)
      .where(
        and(
          eq(documentUploads.driverUserId, driverId),
          gt(documentUploads.createdAt, sql`now() - interval '1 day'`),
        ),
      );
    if (
      counts!.lastHour >= this.env.UPLOAD_LIMIT_PER_HOUR ||
      counts!.lastDay >= this.env.UPLOAD_LIMIT_PER_DAY
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: UPLOAD_LIMIT_REACHED,
          message: 'You have uploaded many files recently, try again later',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** The driver's own check: status, reason, pages uploaded and the kinds still missing. */
  async get(driverId: string): Promise<Verification> {
    const [profile] = await this.db
      .select({
        status: driverProfiles.verificationStatus,
        rejectionReason: driverProfiles.rejectionReason,
        submittedAt: driverProfiles.submittedAt,
        reviewedAt: driverProfiles.reviewedAt,
      })
      .from(driverProfiles)
      .where(eq(driverProfiles.userId, driverId));
    const documents = await listDocuments(this.db, driverId);
    return {
      status: profile!.status,
      rejectionReason: profile!.rejectionReason,
      submittedAt: profile!.submittedAt?.toISOString() ?? null,
      reviewedAt: profile!.reviewedAt?.toISOString() ?? null,
      documents,
      missingKinds: DOCUMENT_KINDS.filter((kind) => !documents.some((d) => d.kind === kind)),
    };
  }

  /**
   * Adds the next page of a document. `409` unless the driver is `unsubmitted` or
   * `rejected`, or the document already has {@link MAX_PAGES_PER_KIND} pages. The caller
   * has checked the bytes.
   */
  async addPage(
    driverId: string,
    kind: DocumentKind,
    contentType: UploadContentType,
    bytes: Buffer,
  ): Promise<DriverDocument> {
    try {
      return await this.db.transaction(async (tx) => {
        await this.lockEditable(tx, driverId);
        // Again under the profile lock: concurrent uploads cannot both take the last slot.
        await this.assertCanUpload(driverId, tx);
        await tx.insert(documentUploads).values({ driverUserId: driverId });
        const [last] = await tx
          .select({ page: sql<number>`coalesce(max(${driverDocuments.page}), 0)::int` })
          .from(driverDocuments)
          .where(and(eq(driverDocuments.driverUserId, driverId), eq(driverDocuments.kind, kind)));
        const page = last!.page + 1;
        if (page > MAX_PAGES_PER_KIND) {
          throw new ConflictException(`A document has at most ${MAX_PAGES_PER_KIND} pages`);
        }
        const fileId = await this.store.put(driverId, contentType, bytes, tx);
        const [row] = await tx
          .insert(driverDocuments)
          // A page's id is its file's id, so `GET /files/:id` serves a page by the id the API lists.
          .values({ id: fileId, driverUserId: driverId, kind, fileId, page })
          .returning({ id: driverDocuments.id, createdAt: driverDocuments.createdAt });
        return {
          id: row!.id,
          kind,
          page,
          contentType,
          sizeBytes: bytes.length,
          createdAt: row!.createdAt.toISOString(),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Try uploading the page again');
      throw error;
    }
  }

  /** Deletes a page (and its file). `404` if it is not the driver's; `409` once submitted. */
  async deletePage(driverId: string, documentId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockEditable(tx, driverId);
      const [document] = await tx
        .select({ fileId: driverDocuments.fileId })
        .from(driverDocuments)
        .where(and(eq(driverDocuments.id, documentId), eq(driverDocuments.driverUserId, driverId)));
      if (!document) throw new NotFoundException('Document not found');
      // The document row goes with its file (cascade).
      await tx.delete(files).where(eq(files.id, document.fileId));
    });
  }

  /**
   * Sends the documents for review: `pending`. `409` unless the driver is `unsubmitted` or
   * `rejected` and every kind has at least one page.
   */
  async submit(driverId: string): Promise<Verification> {
    await this.db.transaction(async (tx) => {
      await this.lockEditable(tx, driverId);
      const kinds = await tx
        .selectDistinct({ kind: driverDocuments.kind })
        .from(driverDocuments)
        .where(eq(driverDocuments.driverUserId, driverId));
      const missing = DOCUMENT_KINDS.filter((kind) => !kinds.some((k) => k.kind === kind));
      if (missing.length > 0) {
        throw new ConflictException(`Upload every document first (missing: ${missing.join(', ')})`);
      }
      await tx
        .update(driverProfiles)
        .set({
          verificationStatus: 'pending',
          rejectionReason: null,
          submittedAt: this.now(),
          updatedAt: sql`now()`,
        })
        .where(eq(driverProfiles.userId, driverId));
    });
    return this.get(driverId);
  }

  /** Locks the driver's profile row; `409` unless the documents can still be changed. */
  private async lockEditable(tx: Pick<Database, 'select'>, driverId: string): Promise<void> {
    const [profile] = await tx
      .select({ status: driverProfiles.verificationStatus })
      .from(driverProfiles)
      .where(eq(driverProfiles.userId, driverId))
      .for('update');
    if (!profile || !EDITABLE.includes(profile.status)) {
      throw new ConflictException('Your documents are under review or approved');
    }
  }
}
