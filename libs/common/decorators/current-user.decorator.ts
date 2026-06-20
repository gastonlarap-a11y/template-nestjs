import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Injects the authenticated principal (or one of its properties) into a route
 * handler. Populated by the JWT strategy's `validate()`.
 *
 * @example
 * ```ts
 * findMe(@CurrentUser() user: AuthenticatedUser) { ... }
 * findMyId(@CurrentUser('userId') id: string) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthenticatedUser | undefined,
    ctx: ExecutionContext,
  ):
    | AuthenticatedUser
    | AuthenticatedUser[keyof AuthenticatedUser]
    | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
