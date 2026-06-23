/**
 * Interactive template initializer — `pnpm run init`.
 *
 * Tailors this template to a new project: renames it, picks a database engine,
 * optionally strips Prisma / auth / Application Insights, rewrites `.env`,
 * adjusts dependencies, and removes the now-unused files — leaving a clean,
 * ready-to-code repository.
 *
 * It is intentionally idempotent-ish and defensive: every file mutation reads
 * current contents first and only writes when present.
 */
import { execa } from 'execa';
import {
  cancel,
  confirm,
  intro,
  isCancel,
  note,
  outro,
  select,
  spinner,
  text,
} from '@clack/prompts';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const path = (...p: string[]) => join(ROOT, ...p);

type DbEngine = 'mssql' | 'postgresql';

interface Answers {
  projectName: string;
  includePrisma: boolean;
  dbEngine: DbEngine;
  includeAuth: boolean;
  includeAppInsights: boolean;
}

// --------------------------------------------------------------------------
// Small filesystem helpers
// --------------------------------------------------------------------------

async function edit(
  file: string,
  fn: (content: string) => string,
): Promise<void> {
  const target = path(file);
  if (!existsSync(target)) return;
  const before = await readFile(target, 'utf8');
  await writeFile(target, fn(before), 'utf8');
}

async function remove(...targets: string[]): Promise<void> {
  await Promise.all(
    targets.map((t) => rm(path(t), { recursive: true, force: true })),
  );
}

function ensureContinue<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Initialization cancelled.');
    process.exit(0);
  }
  return value;
}

// --------------------------------------------------------------------------
// Prompts
// --------------------------------------------------------------------------

async function ask(): Promise<Answers> {
  const projectName = ensureContinue(
    await text({
      message: 'Project name?',
      placeholder: 'my-service',
      defaultValue: 'my-service',
      validate: (v) => {
        const value = v ?? '';
        return /^[a-z0-9-]+$/.test(value) || value === ''
          ? undefined
          : 'Use lowercase letters, numbers and dashes only.';
      },
    }),
  );

  const includePrisma = ensureContinue(
    await confirm({ message: 'Include Prisma ORM?', initialValue: true }),
  );

  let dbEngine: DbEngine = 'mssql';
  if (includePrisma) {
    dbEngine = ensureContinue(
      await select({
        message: 'Database engine?',
        initialValue: 'mssql',
        options: [
          { value: 'mssql', label: 'SQL Server / MSSQL', hint: 'default' },
          { value: 'postgresql', label: 'PostgreSQL' },
        ],
      }),
    );
  }

  const includeAuth = ensureContinue(
    await confirm({
      message: 'Include Authentication module (Azure AD JWT + local mock)?',
      initialValue: true,
    }),
  );

  const includeAppInsights = ensureContinue(
    await confirm({
      message: 'Include external logging (Azure Application Insights)?',
      initialValue: true,
    }),
  );

  return {
    projectName: projectName || 'my-service',
    includePrisma,
    dbEngine,
    includeAuth,
    includeAppInsights,
  };
}

// --------------------------------------------------------------------------
// Transformations
// --------------------------------------------------------------------------

async function applyProjectName(name: string): Promise<void> {
  await edit('package.json', (c) =>
    c.replace(/"name":\s*"[^"]*"/, `"name": "${name}"`),
  );
  const title = name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  await edit('src/main.ts', (c) =>
    c.replace(/\.setTitle\('[^']*'\)/, `.setTitle('${title} API')`),
  );
  await edit('README.md', (c) => c.replace(/^#\s+.*$/m, `# ${title}`));
}

async function applyPostgres(): Promise<void> {
  // Prisma schema: provider + SQL-Server-specific column types -> Postgres.
  await edit('prisma/schema.prisma', (c) =>
    c
      .replace('provider = "sqlserver"', 'provider = "postgresql"')
      .replaceAll('@db.UniqueIdentifier', '@db.Uuid')
      .replaceAll('@db.NVarChar(Max)', '@db.Text')
      .replace('@db.NVarChar(320)', '@db.VarChar(320)')
      .replace('@db.NVarChar(200)', '@db.VarChar(200)'),
  );

  // Swap the driver adapter in the service + seed.
  const swapAdapter = (c: string) =>
    c
      .replace('@prisma/adapter-mssql', '@prisma/adapter-pg')
      .replaceAll('PrismaMssql', 'PrismaPg')
      .replace(
        "new PrismaPg(config.get('DATABASE_URL'))",
        "new PrismaPg({ connectionString: config.get('DATABASE_URL') })",
      )
      .replace(
        'new PrismaPg(connectionString)',
        'new PrismaPg({ connectionString })',
      );
  await edit('libs/database/prisma.service.ts', swapAdapter);
  await edit('prisma/seed.ts', swapAdapter);
}

async function removePrisma(): Promise<void> {
  await remove(
    'prisma',
    'libs/database',
    'src/modules/users/infrastructure/prisma-user.repository.ts',
  );

  // Rebind the Users module to the in-memory repository.
  await edit('src/modules/users/users.module.ts', (c) =>
    c
      .replace(
        "import { PrismaUserRepository } from './infrastructure/prisma-user.repository';",
        "import { InMemoryUserRepository } from './infrastructure/in-memory-user.repository';",
      )
      .replace(
        '{ provide: UserRepository, useClass: PrismaUserRepository }',
        '{ provide: UserRepository, useClass: InMemoryUserRepository }',
      ),
  );

  // Drop PrismaModule from the app graph.
  await edit('src/app.module.ts', (c) =>
    c
      .replace(/import \{ PrismaModule \} from '@app\/database';\n/, '')
      .replace(/\s*PrismaModule,/, ''),
  );

  // Replace the health controller with a DB-less version.
  await writeFile(
    path('libs/observability/health.controller.ts'),
    DBLESS_HEALTH_CONTROLLER,
    'utf8',
  );
}

async function removeAuth(): Promise<void> {
  await remove('libs/auth');
  await edit('src/app.module.ts', (c) =>
    c
      .replace(/import \{ AuthModule \} from '@app\/auth';\n/, '')
      .replace(/\s*AuthModule,/, ''),
  );
  note(
    'Auth removed. `@Roles()` / `@ApiBearerAuth()` decorators remain but are now no-ops; remove them at your leisure.',
    'Heads up',
  );
}

async function removeAppInsights(): Promise<void> {
  // Replace instrumentation with a pure no-op so the first import still resolves.
  await writeFile(
    path('libs/observability/instrumentation.ts'),
    '// Application Insights was disabled during init — no-op instrumentation.\nexport {};\n',
    'utf8',
  );
}

async function writeEnv(answers: Answers): Promise<void> {
  const lines: string[] = [
    '# Generated by `pnpm run init`',
    'NODE_ENV=development',
    'PORT=3000',
    'HOST=0.0.0.0',
    'API_PREFIX=api',
    'LOG_LEVEL=debug',
    'SWAGGER_ENABLED=true',
    '',
  ];

  if (answers.includePrisma) {
    lines.push('# Database');
    lines.push(
      answers.dbEngine === 'mssql'
        ? 'DATABASE_URL="sqlserver://localhost:1433;database=appdb;user=sa;password=Your_password123;encrypt=true;trustServerCertificate=true"'
        : 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/appdb?schema=public"',
      '',
    );
  }

  if (answers.includeAuth) {
    lines.push(
      '# Auth — local mock mode (offline RBAC). Flip USE_LOCAL_MOCK_AUTH=false for Azure AD.',
      'USE_LOCAL_MOCK_AUTH=true',
      'LOCAL_JWT_SECRET=change-me-to-a-long-random-secret-string',
      'LOCAL_JWT_EXPIRES_IN=3600',
      '# AZURE_AD_TENANT_ID=',
      '# AZURE_AD_AUDIENCE=',
      '# AZURE_AD_ISSUER=',
      '',
    );
  }

  if (answers.includeAppInsights) {
    lines.push(
      '# Observability',
      '# APPLICATIONINSIGHTS_CONNECTION_STRING=',
      '',
    );
  }

  await writeFile(path('.env'), lines.join('\n'), 'utf8');
}

async function updateDependencies(answers: Answers): Promise<void> {
  const removeDeps: string[] = [];
  const addDeps: string[] = [];

  if (!answers.includePrisma) {
    removeDeps.push(
      'prisma',
      '@prisma/client',
      '@prisma/adapter-mssql',
      '@prisma/adapter-pg',
      'mssql',
    );
  } else if (answers.dbEngine === 'postgresql') {
    removeDeps.push('@prisma/adapter-mssql', 'mssql');
    addDeps.push('@prisma/adapter-pg', 'pg');
  }

  if (!answers.includeAuth) {
    removeDeps.push(
      '@nestjs/passport',
      'passport',
      'passport-jwt',
      'jwks-rsa',
      '@types/passport-jwt',
    );
  }

  if (!answers.includeAppInsights) {
    removeDeps.push('@azure/monitor-opentelemetry');
  }

  if (removeDeps.length) {
    await execa('pnpm', ['remove', ...removeDeps], { stdio: 'inherit' });
  }
  if (addDeps.length) {
    await execa('pnpm', ['add', ...addDeps], { stdio: 'inherit' });
  }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function run(): Promise<void> {
  intro('🚀 NestJS Enterprise Template initializer');

  const answers = await ask();
  const s = spinner();

  s.start('Applying configuration');
  await applyProjectName(answers.projectName);

  if (!answers.includePrisma) {
    await removePrisma();
  } else if (answers.dbEngine === 'postgresql') {
    await applyPostgres();
  }

  if (!answers.includeAuth) await removeAuth();
  if (!answers.includeAppInsights) await removeAppInsights();

  await writeEnv(answers);
  s.stop('Configuration applied');

  s.start('Updating dependencies (pnpm)');
  await updateDependencies(answers);
  s.stop('Dependencies updated');

  // ---- Self-cleanup: the initializer removes its own footprint. -----------

  // Optionally start a brand-new git history (default off — opt-in only).
  const freshGit = ensureContinue(
    await confirm({
      message: 'Start a fresh git history (delete .git and re-init)?',
      initialValue: false,
    }),
  );
  if (freshGit) {
    await remove('.git');
    await execa('git', ['init'], { stdio: 'inherit' });
  }

  // The init script has done its job — remove its source so it can't run twice,
  // drop its npm script, then uninstall its now-unused dev dependencies. The
  // `pnpm remove` runs last: `execa`/`@clack/prompts` stay on disk (and already
  // loaded in memory) until everything that needs them has finished.
  await remove('scripts/init.ts');
  await edit('package.json', (c) =>
    c.replace(/[ \t]*"init":\s*"[^"]*scripts\/init\.ts",\r?\n/, ''),
  );
  await execa('pnpm', ['remove', '@clack/prompts', 'execa'], {
    stdio: 'inherit',
  });

  const next = [
    answers.includePrisma
      ? 'docker compose up -d        # start the database'
      : null,
    answers.includePrisma ? 'pnpm prisma:generate' : null,
    answers.includePrisma ? 'pnpm prisma:migrate' : null,
    answers.includeAuth
      ? 'pnpm run auth:token         # mint a local JWT'
      : null,
    'pnpm start:dev',
  ].filter(Boolean) as string[];

  note(next.join('\n'), 'Next steps');
  outro(`✅ "${answers.projectName}" is ready. Happy building!`);
}

/** Health controller used when Prisma is removed (no DB readiness check). */
const DBLESS_HEALTH_CONTROLLER = `import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@app/common';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe — process is running.' })
  liveness() {
    return this.health.check([]);
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe.' })
  readiness() {
    return this.health.check([]);
  }
}
`;

run().catch((error: unknown) => {
  cancel(
    `Initialization failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
