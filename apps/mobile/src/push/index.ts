import { type PushData, pushDataSchema } from '@depanini/shared';
import { getMessaging, getToken, onTokenRefresh } from '@react-native-firebase/messaging';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { deleteDevice, putDevice } from '@/api/devices';
import { variant } from '@/variant/variant';

/**
 * Push notifications on a phone. `index.web.ts` has the same exports as
 * no-ops, so the web build never loads `expo-notifications`.
 */

/** The Android channel the API sends to (`docs/push.md`). */
export const ANDROID_CHANNEL_ID = 'default';

/** Longest sign-out waits for the API to forget the token. */
const UNREGISTER_TIMEOUT_MS = 3_000;

// Who is signed in, set by <PushProvider>. Everything below acts for this user.
let currentUid: string | null = null;
// The token the API has for each user, so an unchanged token is not sent again.
const registered = new Map<string, string>();
// Users already asked for permission in this run: ask once, not at every trigger.
const asked = new Set<string>();
// Notifications already routed (the cold-start one is also reported by the listener).
const routed = new Set<string>();

/** Call once at startup: foreground behaviour and the Android channel. Never asks for permission. */
export function configurePush(): void {
  // In the foreground the realtime socket already updates the screen: list only, no banner.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    // Must exist before the first push arrives (and before the permission prompt on Android 13+).
    void Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Depanini',
      importance: AndroidImportance.MAX,
    }).catch(() => {});
  }
}

/** Tells this module who is signed in (null when nobody). */
export function setPushUser(uid: string | null): void {
  currentUid = uid;
}

/**
 * Registers this phone's push token for the signed-in user. Asks for
 * permission unless `prompt` is false (then it only registers when permission
 * was already granted). Does nothing on a simulator, and never throws: push
 * is a convenience, not a requirement.
 */
export async function registerForPush({ prompt = true }: { prompt?: boolean } = {}): Promise<void> {
  const uid = currentUid;
  if (!uid || !Device.isDevice) return;
  if (prompt) {
    if (asked.has(uid)) return;
    asked.add(uid);
  }
  try {
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) {
      if (!prompt || !permission.canAskAgain) return;
      permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) return;
    }
    const token = await currentToken();
    if (token) await sendToken(uid, token);
  } catch {
    // Offline or no push service: the next trigger or token change tries again.
  }
}

/** Removes this phone's token from the signed-in user's account. Best effort, so sign-out never waits long. */
export async function unregisterPush(): Promise<void> {
  const uid = currentUid;
  if (!uid) return;
  try {
    const token = registered.get(uid) ?? (await grantedToken());
    registered.delete(uid);
    asked.delete(uid);
    if (!token) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, UNREGISTER_TIMEOUT_MS);
    });
    try {
      await Promise.race([deleteDevice(token), timeout]);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // The API drops a token that FCM reports as dead anyway.
  }
}

/** Re-registers when FCM hands out a new token, while permission is granted. Returns the unsubscribe. */
export function watchPushToken(): () => void {
  let unsubscribe: () => void;
  try {
    unsubscribe = onTokenRefresh(getMessaging(), (data) => {
      const uid = currentUid;
      if (!uid || !data) return;
      void (async () => {
        try {
          if (!(await Notifications.getPermissionsAsync()).granted) return;
          await sendToken(uid, data);
        } catch {
          // The next token change or registration tries again.
        }
      })();
    });
  } catch {
    // Firebase is not configured in this build: there is no token to follow.
    return () => {};
  }
  return unsubscribe;
}

/**
 * Calls `onTap` with the data of the notification the person tapped: one that
 * opened the app from closed, and every later one. Data the app does not
 * understand is ignored.
 */
export function subscribePushTaps(onTap: (data: PushData) => void): () => void {
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const { identifier } = response.notification.request;
    if (routed.has(identifier)) return;
    const parsed = pushDataSchema.safeParse(response.notification.request.content.data);
    if (!parsed.success) return;
    routed.add(identifier);
    onTap(parsed.data);
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  handle(Notifications.getLastNotificationResponse());
  return () => subscription.remove();
}

async function currentToken(): Promise<string | null> {
  // The API sends through FCM, so both platforms register an FCM token (on iOS, FCM maps it
  // to the APNs token). Called only once permission is granted, which is what registers the
  // phone for remote notifications.
  return (await getToken(getMessaging())) || null;
}

async function grantedToken(): Promise<string | null> {
  if (!Device.isDevice || !(await Notifications.getPermissionsAsync()).granted) return null;
  return currentToken();
}

async function sendToken(uid: string, token: string): Promise<void> {
  if (registered.get(uid) === token) return;
  const platform = Platform.OS;
  if (platform !== 'ios' && platform !== 'android') return;
  await putDevice({ token, platform, appVariant: variant.variant });
  // Remember it only if the same person is still signed in.
  if (currentUid === uid) registered.set(uid, token);
}
