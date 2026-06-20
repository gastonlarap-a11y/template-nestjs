import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { validateEnv } from '@env/env.schema';

import { AppConfigService } from './app-config.service';

/**
 * Resolve the per-stage env file from `APP_ENV` (defaults to `local`).
 *
 * `APP_ENV` is read here, before validation, purely to pick which file to load
 * (`env/.env.<stage>`); the schema still validates/coerces the merged result. A
 * missing file is silently ignored — in cloud environments values arrive from
 * the platform (Azure App Settings / Key Vault) and no `.env` file exists.
 */
const appEnv = process.env.APP_ENV ?? 'local';

/**
 * Global configuration module.
 *
 * Wraps `@nestjs/config` with Zod-based, fail-fast validation and exposes the
 * typed {@link AppConfigService}. Marked `@Global()` so any module can inject
 * configuration without re-importing.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Validate & coerce the entire process environment at startup.
      validate: validateEnv,
      // Load the stage-specific file (e.g. env/.env.local, env/.env.prod).
      envFilePath: [`env/.env.${appEnv}`],
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
