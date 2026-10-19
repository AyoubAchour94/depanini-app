import { UPLOAD_MAX_BYTES } from '@depanini/shared';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { pickPdf, pickPhoto } from './pickers';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg' },
}));

const picker = jest.mocked(ImagePicker);
const documents = jest.mocked(DocumentPicker);
const manipulate = jest.mocked(ImageManipulator.manipulate);

const asset = (extra: object = {}) => ({
  canceled: false,
  assets: [
    {
      uri: 'file:///original.jpg',
      width: 4000,
      height: 3000,
      mimeType: 'image/jpeg',
      fileSize: 900_000,
      ...extra,
    },
  ],
});

/** Makes the manipulator save files of these sizes, one per attempt. */
function compressesTo(...sizes: number[]) {
  const resize = jest.fn();
  let attempt = 0;
  manipulate.mockImplementation(
    () =>
      ({
        resize,
        renderAsync: async () => ({
          saveAsync: async () => ({ uri: `file:///small-${attempt++}.jpg` }),
        }),
      }) as never,
  );
  jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async (url) =>
        new Response(new Uint8Array(sizes[Number(/small-(\d)/.exec(String(url))![1])]!)),
    );
  return resize;
}

beforeEach(() => {
  jest.clearAllMocks();
  picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never);
});
afterEach(() => jest.restoreAllMocks());

describe('pickPhoto', () => {
  it('uses a JPEG within the limit as it is', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue(asset() as never);

    expect(await pickPhoto('library')).toEqual({
      file: { uri: 'file:///original.jpg', name: 'photo.jpg', type: 'image/jpeg' },
    });
    expect(manipulate).not.toHaveBeenCalled();
  });

  it('compresses a photo over 5 MB until it fits', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue(
      asset({ fileSize: UPLOAD_MAX_BYTES + 1 }) as never,
    );
    const resize = compressesTo(UPLOAD_MAX_BYTES + 10, 2_000_000);

    expect(await pickPhoto('library')).toEqual({
      file: { uri: 'file:///small-1.jpg', name: 'photo.jpg', type: 'image/jpeg' },
    });
    expect(resize).toHaveBeenCalledWith({ width: 2400 });
    expect(resize).toHaveBeenCalledWith({ width: 1800 });
  });

  it('converts a format the API does not take (HEIC) to a JPEG', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue(asset({ mimeType: 'image/heic' }) as never);
    compressesTo(300_000);

    expect(await pickPhoto('library')).toEqual({
      file: { uri: 'file:///small-0.jpg', name: 'photo.jpg', type: 'image/jpeg' },
    });
  });

  it('reports a photo that stays too large', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue(
      asset({ fileSize: UPLOAD_MAX_BYTES + 1 }) as never,
    );
    const big = UPLOAD_MAX_BYTES + 1;
    compressesTo(big, big, big);

    expect(await pickPhoto('library')).toEqual({ error: 'tooLarge' });
  });

  it('rejects a file that is not an image', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue(asset({ mimeType: 'video/mp4' }) as never);

    expect(await pickPhoto('library')).toEqual({ error: 'wrongType' });
  });

  it('reports a cancelled pick and a denied camera', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null } as never);
    expect(await pickPhoto('library')).toEqual({ error: 'cancelled' });

    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false } as never);
    expect(await pickPhoto('camera')).toEqual({ error: 'denied' });
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('reports a picker that throws', async () => {
    picker.launchImageLibraryAsync.mockRejectedValue(new Error('boom'));

    expect(await pickPhoto('library')).toEqual({ error: 'failed' });
  });
});

describe('pickPdf', () => {
  const pdf = (extra: object = {}) => ({
    canceled: false,
    assets: [
      { uri: 'file:///a.pdf', name: 'a.pdf', mimeType: 'application/pdf', size: 1000, ...extra },
    ],
  });

  it('returns a PDF within the limit', async () => {
    documents.getDocumentAsync.mockResolvedValue(pdf() as never);

    expect(await pickPdf()).toEqual({
      file: { uri: 'file:///a.pdf', name: 'document.pdf', type: 'application/pdf' },
    });
  });

  it('rejects another type and a PDF over 5 MB', async () => {
    documents.getDocumentAsync.mockResolvedValue(pdf({ mimeType: 'text/plain' }) as never);
    expect(await pickPdf()).toEqual({ error: 'wrongType' });

    documents.getDocumentAsync.mockResolvedValue(pdf({ size: UPLOAD_MAX_BYTES + 1 }) as never);
    expect(await pickPdf()).toEqual({ error: 'tooLarge' });
  });

  it('reports a cancelled pick', async () => {
    documents.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null } as never);

    expect(await pickPdf()).toEqual({ error: 'cancelled' });
  });
});
