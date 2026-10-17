import { getApp } from '@react-native-firebase/app';
import { getAuth, getIdToken } from '@react-native-firebase/auth';
import Constants from 'expo-constants';

export type FirebaseStatus = { configured: true } | { configured: false; reason: string };

let status: FirebaseStatus | undefined;

/**
 * Checks that the native Firebase SDK was initialized. React Native Firebase
 * initializes natively from `google-services.json` / `GoogleService-Info.plist`;
 * this never throws, so a checkout without those files still launches (the
 * app shows a debug banner instead).
 */
export function getFirebaseStatus(): FirebaseStatus {
  if (status) return status;

  if (!Constants.expoConfig?.extra?.firebaseConfigured) {
    status = {
      configured: false,
      reason: 'Firebase config files missing for this variant (see README §3).',
    };
  } else {
    try {
      getApp();
      status = { configured: true };
    } catch (error) {
      status = { configured: false, reason: String(error) };
    }
  }

  if (__DEV__ && !status.configured) {
    console.warn(`Firebase not configured: ${status.reason}`);
  }
  return status;
}

/**
 * The signed-in user's Firebase ID token, for `Authorization: Bearer` on API
 * calls. Undefined when Firebase is not configured or nobody is signed in.
 */
export async function getCurrentIdToken(): Promise<string | undefined> {
  if (!getFirebaseStatus().configured) return undefined;
  const user = getAuth().currentUser;
  return user ? getIdToken(user) : undefined;
}
