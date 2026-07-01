import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * In v7 the datasource connection URL lives here (not in `schema.prisma`) and is
 * used by the CLI for `migrate` / `db` commands. The runtime Prisma Client still
 * connects through the driver adapter configured in
 * `libs/database/prisma.service.ts`; migrations auto-detect the same adapter.
 *
 * Mirrors `libs/config/config.module.ts`'s `env/.env.<APP_ENV>` convention
 * (default `local`) instead of a root `.env` — this repo never has one (see
 * CLAUDE.md rule 6). `dotenv`'s `config()` never overrides variables already
 * present in `process.env`, so a real value injected by the shell/CI (e.g. a
 * placeholder `DATABASE_URL` for `prisma generate`, which never opens a
 * connection) always wins over the file. Missing file is silently ignored,
 * same as `AppConfigModule`, for cloud environments where values come from
 * the platform instead of a file.
 */
const appEnv = process.env.APP_ENV ?? 'local';
loadEnv({ path: `env/.env.${appEnv}`, quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
