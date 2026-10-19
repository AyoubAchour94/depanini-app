import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { DecodedIdToken } from 'firebase-admin/auth';

import { AdminGuard } from './admin.guard.js';
import { FirebaseAuthGuard, type IdTokenVerifier } from './firebase-auth.guard.js';

/** `claims-<json>` decodes to those custom claims; anything else is refused. */
const verifier: IdTokenVerifier = {
  verifyIdToken: async (token) => {
    const match = /^claims-(.*)$/.exec(token);
    if (!match) throw new Error('auth/argument-error');
    return { uid: 'user-123', ...JSON.parse(match[1]!) } as DecodedIdToken;
  },
};

function contextWith(headers: Record<string, string>) {
  const request: { headers: Record<string, string>; user?: DecodedIdToken } = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const bearer = (claims: object) => ({ authorization: `Bearer claims-${JSON.stringify(claims)}` });

describe('AdminGuard', () => {
  const guard = new AdminGuard(new FirebaseAuthGuard(verifier));

  it('accepts a verified token whose admin claim is true and attaches the user', async () => {
    const { context, request } = contextWith(bearer({ admin: true }));
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user?.uid).toBe('user-123');
  });

  it('rejects a request without a token with 401', async () => {
    const { context } = contextWith({});
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token the verifier refuses with 401, whatever it claims', async () => {
    const { context } = contextWith({ authorization: 'Bearer forged-{"admin":true}' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it.each([
    ['no admin claim', {}],
    ['admin: false', { admin: false }],
    ['admin: "true" (a string)', { admin: 'true' }],
    ['admin: 1', { admin: 1 }],
    ['admin: null', { admin: null }],
    ['an admin claim nested elsewhere', { claims: { admin: true } }],
  ])('rejects a verified token with %s with 403', async (_name, claims) => {
    const { context } = contextWith(bearer(claims));
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
