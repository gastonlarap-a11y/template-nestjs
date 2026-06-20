import { SetMetadata } from '@nestjs/common';

/** Metadata key under which required roles are stored. */
export const ROLES_KEY = 'roles';

/**
 * Declares the application roles allowed to access a route or controller.
 * Enforced by `RolesGuard` (from `@app/auth`), which checks the `roles` claim
 * of the authenticated principal.
 *
 * @example
 * ```ts
 * @Roles('Admin', 'UserManager')
 * @Get()
 * findAll() { ... }
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
