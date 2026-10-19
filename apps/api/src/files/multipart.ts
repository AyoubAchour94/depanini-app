import multipart from '@fastify/multipart';
import { UPLOAD_MAX_BYTES } from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * Enables `multipart/form-data` on the app: one file of at most {@link UPLOAD_MAX_BYTES}
 * plus a few small fields per request. Call it before `app.init()` / `app.listen()`.
 */
export async function registerMultipart(app: NestFastifyApplication): Promise<void> {
  await app.register(multipart as never, {
    limits: { fileSize: UPLOAD_MAX_BYTES, files: 1, fields: 5, parts: 6, fieldSize: 256 },
  });
}
