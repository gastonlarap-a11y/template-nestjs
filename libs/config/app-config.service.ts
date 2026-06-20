import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '@env/env.schema';

/**
 * Thin, fully-typed facade over Nest's {@link ConfigService}.
 *
 * Inject this instead of the raw `ConfigService<EnvConfig>` so call sites get
 * autocompletion, non-null guarantees (env is validated at boot) and a single
 * place to add derived/computed configuration (e.g. the Azure AD issuer URL).
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  /** Type-safe accessor for a single validated env value. */
  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get isDevelopment(): boolean {
    return this.get('NODE_ENV') === 'development';
  }

  /** Whether the local symmetric-secret auth fallback is active. */
  get useLocalMockAuth(): boolean {
    return this.get('USE_LOCAL_MOCK_AUTH');
  }

  /** Azure AD JWKS endpoint for the configured tenant. */
  get azureAdJwksUri(): string {
    const tenant = this.get('AZURE_AD_TENANT_ID');
    return `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`;
  }

  /** Expected `iss` claim — explicit override or the derived v2.0 issuer. */
  get azureAdIssuer(): string {
    const explicit = this.get('AZURE_AD_ISSUER');
    if (explicit) return explicit;
    const tenant = this.get('AZURE_AD_TENANT_ID');
    return `https://login.microsoftonline.com/${tenant}/v2.0`;
  }
}
