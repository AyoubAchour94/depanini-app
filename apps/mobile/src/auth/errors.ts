const messages: Record<string, string> = {
  'auth/invalid-email': 'Enter a valid email address.',
  // Firebase reports a wrong password and an unknown email the same way
  // (email enumeration protection), so the message covers both.
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled yet.',
  'auth/missing-password': 'Enter your password.',
  'auth/requires-recent-login': 'For your security, sign out and sign in again, then retry.',
};

/** A message to show the user for an error thrown by Firebase Auth. */
export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return messages[code] ?? 'Something went wrong. Try again.';
}
