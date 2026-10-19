import type { UploadContentType } from '@depanini/shared';

import type { Database } from '../db/database.module.js';

/** What a {@link FileStore} runs its queries on: the database, or a transaction of it. */
export type DbExecutor = Pick<Database, 'select' | 'insert' | 'delete'>;

/** Injection token for the {@link FileStore}. */
export const FILE_STORE = Symbol('FILE_STORE');

/** A stored file with its bytes. */
export interface StoredFile {
  id: string;
  ownerUserId: string;
  contentType: UploadContentType;
  sizeBytes: number;
  data: Buffer;
}

/**
 * Where uploaded files live. The MVP keeps them in Postgres ({@link PostgresFileStore});
 * moving to object storage later means another implementation of this interface.
 * Callers check the bytes (type and size) before `put`.
 */
export interface FileStore {
  /** Stores `bytes` for `ownerUserId` and returns the new file's id. */
  put(
    ownerUserId: string,
    contentType: UploadContentType,
    bytes: Buffer,
    executor?: DbExecutor,
  ): Promise<string>;
  /** The file, or `null` if there is none. */
  get(fileId: string): Promise<StoredFile | null>;
  /** Deletes the file (and whatever refers to it); does nothing if there is none. */
  delete(fileId: string, executor?: DbExecutor): Promise<void>;
}
