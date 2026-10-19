import { detectContentType } from './content-type.js';

describe('detectContentType', () => {
  it.each([
    ['image/jpeg', [0xff, 0xd8, 0xff, 0xe0]],
    ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]],
    ['application/pdf', [...Buffer.from('%PDF-1.4\n')]],
  ])('recognises %s', (type, bytes) => {
    expect(detectContentType(Buffer.from(bytes))).toBe(type);
  });

  it.each([
    ['plain text', Buffer.from('hello world')],
    ['a truncated signature', Buffer.from([0xff, 0xd8])],
    ['an empty file', Buffer.alloc(0)],
    ['a PDF without the dash', Buffer.from('%PDF1.4')],
    ['a GIF', Buffer.from('GIF89a')],
  ])('rejects %s', (_name, bytes) => {
    expect(detectContentType(bytes)).toBeNull();
  });
});
