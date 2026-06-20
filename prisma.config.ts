import 'dotenv/config';

import { defineConfig, env } from 'prisma/config';

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * In v7 the datasource connection URL lives here (not in `schema.prisma`) and is
 * used by the CLI for `migrate` / `db` commands. The runtime Prisma Client still
 * connects through the driver adapter configured in
 * `libs/database/prisma.service.ts`; migrations auto-detect the same adapter.
 *
 * `dotenv/config` loads `.env` so `DATABASE_URL` is available to the CLI.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
