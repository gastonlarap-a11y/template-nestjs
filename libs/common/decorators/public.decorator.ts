import { SetMetadata } from '@nestjs/common';

/** Metadata key marking a route as publicly accessible (no auth required). */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route or controller as public, bypassing the global `JwtAuthGuard`.
 * Use sparingly — e.g. health checks, auth callbacks, public webhooks.
 *
 * @example
 * ```ts
 * @Public()
 * @Get('health')
 * health() { ... }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
