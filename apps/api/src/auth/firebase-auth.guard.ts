import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { FastifyRequest } from 'fastify';

/** The slice of `firebase-admin`'s Auth the guard needs; easy to fake in tests. */
export interface IdTokenVerifier {
  verifyIdToken(idToken: string): Promise<DecodedIdToken>;
}

/** Injection token for the {@link IdTokenVerifier}. */
export const ID_TOKEN_VERIFIER = Symbol('ID_TOKEN_VERIFIER');

export type AuthenticatedRequest = FastifyRequest & { user: DecodedIdToken };

/**
 * Accepts requests carrying a valid Firebase ID token
 * (`Authorization: Bearer <token>`) and exposes the decoded token as
 * `request.user`. Apply per route with `@UseGuards(FirebaseAuthGuard)`.
 *
 * Phase 1: wired and tested, not yet applied to any route.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(@Inject(ID_TOKEN_VERIFIER) private readonly verifier: IdTokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    try {
      request.user = await this.verifier.verifyIdToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
