import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY } from './rbac.decorator';
import type { Scope } from '@gepetto-shield/shared';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<Scope[]>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No scopes required → allow (auth guard already verified JWT)
    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const claims = request.user;

    if (!claims?.scopes) {
      throw new ForbiddenException('Sin scopes asignados');
    }

    const userScopes = new Set(claims.scopes);
    const hasAll = requiredScopes.every((scope) => userScopes.has(scope));

    if (!hasAll) {
      throw new ForbiddenException(
        `Acceso denegado. Scopes requeridos: ${requiredScopes.join(', ')}`,
      );
    }

    return true;
  }
}
