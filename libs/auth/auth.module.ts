import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';

import { AppConfigModule } from '@app/config';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './jwt.strategy';

/**
 * Authentication & authorization module.
 *
 * Registers the dual-mode {@link JwtStrategy} and wires **global** guards so the
 * whole API is "secure by default":
 *  1. {@link JwtAuthGuard} — requires a valid JWT (opt out with `@Public()`).
 *  2. {@link RolesGuard}   — enforces `@Roles(...)` when present.
 *
 * Guard order matches registration order (authenticate, then authorize).
 */
@Module({
  imports: [AppConfigModule, PassportModule],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
