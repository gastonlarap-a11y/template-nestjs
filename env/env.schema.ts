import { z } from 'zod';

/**
 * Centralised, strongly-typed environment schema (Zod v4).
 *
 * This is the single source of truth for every environment variable the
 * service consumes. It is validated **once at boot** (see {@link validateEnv}),
 * so a misconfigured container fails fast and loudly instead of throwing
 * obscure runtime errors deep in a request handler.
 *
 * Conventions:
 *  - `z.coerce.number()` parses numeric env strings ("3000" -> 3000).
 *  - `z.stringbool()` parses "true"/"false"/"1"/"0"/"yes"/"no" into a boolean.
 *  - Conditional requirements (auth mode) are enforced in a `superRefine`.
 *
 * Lives under `env/` (not `libs/`) so all environment concerns — the schema and
 * the per-stage `.env.<stage>` files — sit together. Imported via the `@env`
 * path alias.
 */
export const envSchema = z
  .object({
    // ---- Deployment stage -------------------------------------------------
    /**
     * Logical deployment stage. Selects which `env/.env.<APP_ENV>` file the
     * {@link AppConfigModule} loads at boot (defaults to `local`). Distinct from
     * {@link NODE_ENV}, which keeps its standard meaning for the framework and
     * tooling (Nest, pino, jest).
     */
    APP_ENV: z.enum(['local', 'dev', 'qa', 'prod']).default('local'),

    // ---- Runtime ----------------------------------------------------------
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('0.0.0.0'),
    /** Public base path for the API (used by Swagger server URL). */
    API_PREFIX: z.string().default('api'),

    // ---- Observability ----------------------------------------------------
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Azure Application Insights / Monitor connection string (optional). */
    APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional(),

    // ---- API documentation ------------------------------------------------
    SWAGGER_ENABLED: z.stringbool().default(true),

    // ---- Database (Prisma) ------------------------------------------------
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // ---- Authentication (dual strategy) -----------------------------------
    /**
     * When `true`, the JWT strategy validates tokens against the symmetric
     * {@link LOCAL_JWT_SECRET} (HS256) instead of Azure AD JWKS. Intended for
     * local development / CI only — never enable in production.
     */
    USE_LOCAL_MOCK_AUTH: z.stringbool().default(false),
    LOCAL_JWT_SECRET: z.string().optional(),

    /** Azure AD (Entra ID) directory (tenant) id. */
    AZURE_AD_TENANT_ID: z.string().optional(),
    /** Expected `aud` claim — usually the API's Application (client) id. */
    AZURE_AD_AUDIENCE: z.string().optional(),
    /**
     * Expected `iss` claim. Defaults to the v2.0 issuer derived from the
     * tenant id when omitted.
     */
    AZURE_AD_ISSUER: z.string().optional(),

    /** Shared token lifetime (seconds) used by the mock-token generator. */
    LOCAL_JWT_EXPIRES_IN: z.coerce.number().int().positive().default(3600),
  })
  .superRefine((env, ctx) => {
    if (env.USE_LOCAL_MOCK_AUTH) {
      if (!env.LOCAL_JWT_SECRET || env.LOCAL_JWT_SECRET.length < 16) {
        ctx.addIssue({
          code: 'custom',
          path: ['LOCAL_JWT_SECRET'],
          message:
            'LOCAL_JWT_SECRET (>= 16 chars) is required when USE_LOCAL_MOCK_AUTH=true.',
        });
      }
    } else {
      // Production / Azure AD mode requires tenant + audience to validate JWKS.
      for (const key of ['AZURE_AD_TENANT_ID', 'AZURE_AD_AUDIENCE'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when USE_LOCAL_MOCK_AUTH is not enabled.`,
          });
        }
      }
    }
  });

/** Fully-parsed, typed environment. */
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validation callback consumed by `@nestjs/config`'s `ConfigModule.forRoot`.
 * Throws an aggregated, human-readable error if any variable is invalid.
 */
export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`❌ Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
