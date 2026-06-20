import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { type AuthenticatedUser, ROLES_KEY } from '@app/common';

/**
 * RBAC guard. Runs after {@link JwtAuthGuard} and enforces the roles declared
 * via `@Roles(...)`. Routes without `@Roles` are unaffected (authentication
 * alone suffices). Role matching is "any-of".
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();

    const hasRole = user?.roles?.some((role: string) =>
      requiredRoles.includes(role),
    );
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Requires one of: ${requiredRoles.join(', ')}.`,
      );
    }
    return true;
  }
}
