import type { PushData } from '@depanini/shared';

// Web has no native push (this build is for UI checks): the same exports as
// `index.ts`, doing nothing, so `expo-notifications` is never bundled.

export const ANDROID_CHANNEL_ID = 'default';

export function configurePush(): void {}

export function setPushUser(uid: string | null): void {
  void uid;
}

export async function registerForPush(options?: { prompt?: boolean }): Promise<void> {
  void options;
}

export async function unregisterPush(): Promise<void> {}

export function watchPushToken(): () => void {
  return () => {};
}

export function subscribePushTaps(onTap: (data: PushData) => void): () => void {
  void onTap;
  return () => {};
}
