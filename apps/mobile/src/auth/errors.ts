import { translate } from '@/i18n';

/** Firebase error code to the key (under `auth:errors`) of its message. */
const messageKeys: Record<string, string> = {
  'auth/invalid-email': 'invalidEmail',
  // Firebase reports a wrong password and an unknown email the same way
  // (email enumeration protection), so the message covers both.
  'auth/invalid-credential': 'invalidCredential',
  'auth/wrong-password': 'invalidCredential',
  'auth/user-not-found': 'invalidCredential',
  'auth/email-already-in-use': 'emailInUse',
  'auth/weak-password': 'weakPassword',
  'auth/too-many-requests': 'tooManyRequests',
  'auth/network-request-failed': 'network',
  'auth/user-disabled': 'userDisabled',
  'auth/operation-not-allowed': 'operationNotAllowed',
  'auth/requires-recent-login': 'requiresRecentLogin',
};

/** The Firebase Auth error code (`auth/...`) of a thrown error, if it has one. */
export function authErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

/** A message to show the user for an error thrown by Firebase Auth. */
export function authErrorMessage(error: unknown): string {
  return translate(`auth:errors.${messageKeys[authErrorCode(error)] ?? 'generic'}`);
}
