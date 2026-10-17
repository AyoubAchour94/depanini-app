import { authErrorMessage } from './errors';

describe('authErrorMessage', () => {
  it('maps a known Firebase error code', () => {
    expect(authErrorMessage({ code: 'auth/email-already-in-use' })).toBe(
      'An account with this email already exists. Sign in instead.',
    );
  });

  it('gives the same message for a wrong password and an unknown email', () => {
    expect(authErrorMessage({ code: 'auth/wrong-password' })).toBe(
      authErrorMessage({ code: 'auth/user-not-found' }),
    );
  });

  it('falls back to a generic message', () => {
    expect(authErrorMessage({ code: 'auth/internal-error' })).toBe(
      'Something went wrong. Try again.',
    );
    expect(authErrorMessage(new Error('boom'))).toBe('Something went wrong. Try again.');
    expect(authErrorMessage(undefined)).toBe('Something went wrong. Try again.');
  });
});
