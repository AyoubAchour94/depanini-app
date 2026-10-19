import type { UploadContentType } from '@depanini/shared';

const startsWith = (bytes: Buffer, signature: number[]) =>
  bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);

/**
 * The upload type the bytes really are, from their magic numbers (JPEG `FF D8 FF`,
 * PNG `89 50 4E 47`, PDF `%PDF-`), or `null` for anything else. The client's
 * declared type and filename are never trusted.
 */
export function detectContentType(bytes: Buffer): UploadContentType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}
