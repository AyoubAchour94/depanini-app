import { Platform, Share } from 'react-native';

/** `shared`: the share sheet took it; `copied`: it went to the clipboard; `cancelled`: the user closed the sheet. */
export type ShareResult = 'shared' | 'copied' | 'cancelled';

/**
 * Shares plain text: the share sheet on native; on the web `navigator.share`
 * when the browser has it, otherwise the clipboard. Rejects when neither works.
 */
export async function shareText(text: string): Promise<ShareResult> {
  if (Platform.OS !== 'web') {
    const result = await Share.share({ message: text });
    return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      // Closing the share sheet rejects with an AbortError.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}
