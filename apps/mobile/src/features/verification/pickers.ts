import { UPLOAD_MAX_BYTES } from '@depanini/shared';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { UploadFile } from '@/api/verification';

/** What picking a file ended with. `cancelled` is not a failure: the screen ignores it. */
export type PickResult =
  { file: UploadFile } | { error: 'cancelled' | 'denied' | 'wrongType' | 'tooLarge' | 'failed' };

export type PhotoSource = 'camera' | 'library';

/** Widths and JPEG qualities tried, in order, until the photo fits the upload limit. */
const COMPRESSION_STEPS = [
  { width: 2400, compress: 0.85 },
  { width: 1800, compress: 0.7 },
  { width: 1200, compress: 0.5 },
] as const;

async function sizeOf(uri: string): Promise<number> {
  return (await (await fetch(uri)).blob()).size;
}

/** Re-encodes the photo as a smaller JPEG; null when even the smallest step is too big. */
async function compress(asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
  for (const { width, compress: quality } of COMPRESSION_STEPS) {
    const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
    if (asset.width > width) context.resize({ width });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    if ((await sizeOf(saved.uri)) <= UPLOAD_MAX_BYTES) return saved.uri;
  }
  return null;
}

/**
 * A photo from the camera or the library, as a JPEG or PNG of at most 5 MB. A bigger photo
 * (or a format the API does not take, like HEIC) is compressed to a JPEG first.
 */
export async function pickPhoto(source: PhotoSource): Promise<PickResult> {
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return { error: 'denied' };
    }
    const options = { mediaTypes: ['images' as const], quality: 1 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return { error: 'cancelled' };
    if (asset.mimeType && !asset.mimeType.startsWith('image/')) return { error: 'wrongType' };

    const fits = asset.fileSize !== undefined && asset.fileSize <= UPLOAD_MAX_BYTES;
    if (fits && (asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/png')) {
      const type = asset.mimeType;
      return {
        file: { uri: asset.uri, name: type === 'image/png' ? 'photo.png' : 'photo.jpg', type },
      };
    }
    const uri = await compress(asset);
    return uri ? { file: { uri, name: 'photo.jpg', type: 'image/jpeg' } } : { error: 'tooLarge' };
  } catch {
    return { error: 'failed' };
  }
}

/** A PDF of at most 5 MB. */
export async function pickPdf(): Promise<PickResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      multiple: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return { error: 'cancelled' };
    if (asset.mimeType !== 'application/pdf') return { error: 'wrongType' };
    if (asset.size !== undefined && asset.size > UPLOAD_MAX_BYTES) return { error: 'tooLarge' };
    return { file: { uri: asset.uri, name: 'document.pdf', type: 'application/pdf' } };
  } catch {
    return { error: 'failed' };
  }
}
