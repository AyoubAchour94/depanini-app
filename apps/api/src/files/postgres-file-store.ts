import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { UPLOAD_MAX_BYTES, type UploadContentType } from '@depanini/shared';
import { eq } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { files } from '../db/schema.js';
import type { FileStore, StoredFile } from './file-store.js';

/** {@link FileStore} that keeps the bytes in the `files` table (`bytea`). */
@Injectable()
export class PostgresFileStore implements FileStore {
  constructor(@Inject(DB) private readonly db: Database) {}

  async put(ownerUserId: string, contentType: UploadContentType, bytes: Buffer): Promise<string> {
    if (bytes.length === 0 || bytes.length > UPLOAD_MAX_BYTES) {
      throw new RangeError(`A file must be 1 to ${UPLOAD_MAX_BYTES} bytes, not ${bytes.length}`);
    }
    const [row] = await this.db
      .insert(files)
      .values({
        ownerUserId,
        contentType,
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        data: bytes,
      })
      .returning({ id: files.id });
    return row!.id;
  }

  async get(fileId: string): Promise<StoredFile | null> {
    const [row] = await this.db
      .select({
        id: files.id,
        ownerUserId: files.ownerUserId,
        contentType: files.contentType,
        sizeBytes: files.sizeBytes,
        data: files.data,
      })
      .from(files)
      .where(eq(files.id, fileId));
    return row ?? null;
  }

  async delete(fileId: string): Promise<void> {
    await this.db.delete(files).where(eq(files.id, fileId));
  }
}
