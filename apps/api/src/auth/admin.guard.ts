import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { type AuthenticatedRequest, FirebaseAuthGuard } from './firebase-auth.guard.js';

/**
 * Accepts only admins: a valid Firebase ID token (else `401`, as {@link FirebaseAuthGuard})
 * whose custom claim `admin` is exactly `true` (else `403`). The claim is set with
 * `pnpm admin:grant`. Apply it to every `/admin/*` controller.
 *
 * A revoked claim stays in tokens already issued until they expire (an hour at most).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: FirebaseAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.auth.canActivate(context);
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (user.admin !== true) throw new ForbiddenException('Admins only');
    return true;
  }
}
