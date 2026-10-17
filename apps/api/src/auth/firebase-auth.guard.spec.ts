import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { DecodedIdToken } from 'firebase-admin/auth';

import { FirebaseAuthGuard, type IdTokenVerifier } from './firebase-auth.guard.js';

const decoded = { uid: 'user-123' } as DecodedIdToken;

const verifier: IdTokenVerifier = {
  verifyIdToken: async (token) => {
    if (token === 'valid-token') return decoded;
    throw new Error('auth/argument-error');
  },
};

function contextWith(headers: Record<string, string>) {
  const request: { headers: Record<string, string>; user?: DecodedIdToken } = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('FirebaseAuthGuard', () => {
  const guard = new FirebaseAuthGuard(verifier);

  it('accepts a valid bearer token and attaches the decoded user', async () => {
    const { context, request } = contextWith({ authorization: 'Bearer valid-token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBe(decoded);
  });

  it('rejects a request without an Authorization header', async () => {
    const { context } = contextWith({});
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a non-bearer scheme', async () => {
    const { context } = contextWith({ authorization: 'Basic valid-token' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token the verifier refuses', async () => {
    const { context } = contextWith({ authorization: 'Bearer forged-token' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
