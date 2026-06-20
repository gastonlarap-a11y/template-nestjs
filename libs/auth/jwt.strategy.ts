import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import {
  ExtractJwt,
  Strategy,
  StrategyOptionsWithoutRequest,
} from 'passport-jwt';

import type { AuthenticatedUser } from '@app/common';
import { AppConfigService } from '@app/config';

/**
 * Raw JWT claims we read. Azure AD (Entra ID) v2.0 access tokens and the local
 * mock tokens share these fields (the mock generator deliberately mirrors the
 * Entra shape — see `scripts/generate-mock-token.ts`).
 */
interface JwtPayload {
  sub: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  /** Entra ID **App Roles** (or any roles the mock signer embeds). */
  roles?: string[];
  [claim: string]: unknown;
}

/**
 * Dual-mode JWT strategy.
 *
 * The validation source is selected **once at boot** from configuration — never
 * per request — which avoids RS256/HS256 algorithm-confusion attacks:
 *
 *  - **Production (default):** verify RS256 signatures against Azure AD's JWKS
 *    endpoint (`jwks-rsa`), pinning the expected `audience` and `issuer`.
 *  - **Local (`USE_LOCAL_MOCK_AUTH=true`):** verify HS256 signatures against the
 *    symmetric `LOCAL_JWT_SECRET`, so RBAC can be exercised offline with no live
 *    tenant (pair with `pnpm run auth:token`).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private static readonly logger = new Logger(JwtStrategy.name);

  constructor(config: AppConfigService) {
    super(JwtStrategy.buildOptions(config));
    JwtStrategy.logger.log(
      config.useLocalMockAuth
        ? '🔓 Auth: LOCAL mock mode (symmetric HS256 secret).'
        : '🔐 Auth: Azure AD (Entra ID) JWKS mode (RS256).',
    );
  }

  /** Builds passport-jwt options for the active auth mode. */
  private static buildOptions(
    config: AppConfigService,
  ): StrategyOptionsWithoutRequest {
    const base = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
    };

    if (config.useLocalMockAuth) {
      return {
        ...base,
        secretOrKey: config.get('LOCAL_JWT_SECRET') as string,
        algorithms: ['HS256'],
      };
    }

    return {
      ...base,
      // Asymmetric verification: fetch + cache Azure AD signing keys.
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: config.azureAdJwksUri,
      }),
      algorithms: ['RS256'],
      audience: config.get('AZURE_AD_AUDIENCE'),
      issuer: config.azureAdIssuer,
    };
  }

  /**
   * Maps verified claims to the provider-agnostic {@link AuthenticatedUser}
   * attached to `request.user`.
   */
  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload.sub) {
      throw new UnauthorizedException('Token is missing the "sub" claim.');
    }
    return {
      userId: payload.sub,
      email: payload.email ?? payload.preferred_username,
      name: payload.name,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
    };
  }
}
