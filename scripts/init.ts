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
  multiselect,
  note,
  outro,
  select,
  spinner,
  text,
} from '@clack/prompts';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const path = (...p: string[]) => join(ROOT, ...p);

type DbEngine = 'mssql' | 'postgresql';
type Capability = 'websockets' | 'microservice';

interface Answers {
  projectName: string;
  dbEngine: DbEngine;
  includeAuth: boolean;
  includeAppInsights: boolean;
  capabilities: Capability[];
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

  // Prisma is always present: every handler injects PrismaService directly
  // (VSA rule — no repository layer to swap it out from under), so only the
  // underlying engine is a real choice.
  const dbEngine = ensureContinue(
    await select<DbEngine>({
      message: 'Database engine?',
      initialValue: 'mssql',
      options: [
        { value: 'mssql', label: 'SQL Server / MSSQL', hint: 'default' },
        { value: 'postgresql', label: 'PostgreSQL' },
      ],
    }),
  );

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

  const capabilities = ensureContinue(
    await multiselect<Capability>({
      message:
        'Additional capabilities? (beyond the REST API baseline — space to toggle, enter to confirm)',
      required: false,
      initialValues: [] as Capability[],
      options: [
        {
          value: 'websockets',
          label: 'WebSockets (Socket.IO gateway, JWT-guarded)',
          hint: 'real-time features: chat, notifications, live updates',
        },
        {
          value: 'microservice',
          label: 'Event-driven microservice (Redis transporter)',
          hint: 'async jobs, pub/sub, queue consumers',
        },
      ],
    }),
  );

  return {
    projectName: projectName || 'my-service',
    dbEngine,
    includeAuth,
    includeAppInsights,
    capabilities: capabilities,
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

  lines.push('# Database');
  lines.push(
    answers.dbEngine === 'mssql'
      ? 'DATABASE_URL="sqlserver://localhost:1433;database=appdb;user=sa;password=Your_password123;encrypt=true;trustServerCertificate=true"'
      : 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/appdb?schema=public"',
    '',
  );

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

  if (answers.capabilities.includes('microservice')) {
    lines.push(
      '# Event-driven microservice (Redis transporter)',
      'REDIS_HOST=localhost',
      'REDIS_PORT=6379',
      '',
    );
  }

  await writeFile(path('.env'), lines.join('\n'), 'utf8');
}

async function updateDependencies(answers: Answers): Promise<void> {
  const removeDeps: string[] = [];
  const addDeps: string[] = [];

  if (answers.dbEngine === 'postgresql') {
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

  if (answers.capabilities.includes('websockets')) {
    addDeps.push(
      '@nestjs/websockets',
      '@nestjs/platform-socket.io',
      'socket.io',
    );
    // `libs/websockets`/`libs/auth/verify-token.ts` use `jsonwebtoken` at
    // *runtime* (unlike the base template, where it's only a devDependency
    // used by `scripts/generate-mock-token.ts`). The prod Docker image runs
    // `pnpm prune --prod`, so this must move to a real dependency once
    // WebSockets is enabled, or the container crashes with "Cannot find
    // module". Remove-then-add moves it cleanly instead of listing it twice.
    removeDeps.push('jsonwebtoken');
    addDeps.push('jsonwebtoken');
  }

  if (answers.capabilities.includes('microservice')) {
    addDeps.push('@nestjs/microservices', 'ioredis');
  }

  if (removeDeps.length) {
    await execa('pnpm', ['remove', ...removeDeps], { stdio: 'inherit' });
  }
  if (addDeps.length) {
    await execa('pnpm', ['add', ...addDeps], { stdio: 'inherit' });
  }
}

// --------------------------------------------------------------------------
// Optional capabilities (opt-in via the "Additional capabilities?" prompt)
// --------------------------------------------------------------------------

/** Shared helper: import + register a feature module in `src/app.module.ts`. */
async function wireFeatureModuleIntoAppModule(
  moduleClassName: string,
  importPath: string,
): Promise<void> {
  const appModulePath = path('src/app.module.ts');
  const before = await readFile(appModulePath, 'utf8');
  if (before.includes(moduleClassName)) return; // already wired

  const importLine = `import { ${moduleClassName} } from '${importPath}';\n`;
  let after = before;

  const lastImportMatch = [...after.matchAll(/^import .*;\n/gm)].pop();
  if (lastImportMatch) {
    const insertAt = lastImportMatch.index + lastImportMatch[0].length;
    after = after.slice(0, insertAt) + importLine + after.slice(insertAt);
  } else {
    after = importLine + after;
  }

  after = after.replace(/imports:\s*\[([^\]]*)\]/, (_match, inner: string) => {
    // Strip a trailing comma left over from the previous entry so repeated
    // runs don't accumulate "Foo,,\n Bar" — only the last entry may lack one.
    const cleaned = inner.trim().replace(/,\s*$/, '');
    const separator = cleaned.length > 0 ? ',\n    ' : '\n    ';
    return `imports: [${cleaned}${separator}${moduleClassName},\n  ]`;
  });

  await writeFile(appModulePath, after, 'utf8');
}

/**
 * Adds a Socket.IO WebSocket gateway, JWT-guarded via the same dual-mode auth
 * as the REST API (Azure AD JWKS / local HS256) — see `libs/auth/verify-token.ts`.
 */
async function addWebsockets(): Promise<void> {
  await mkdir(path('libs/websockets'), { recursive: true });
  await mkdir(path('src/features/notificaciones'), { recursive: true });

  await writeFile(
    path('libs/auth/verify-token.ts'),
    VERIFY_TOKEN_SOURCE,
    'utf8',
  );
  await edit('libs/auth/index.ts', (c) =>
    c.includes('verify-token') ? c : `${c}export * from './verify-token';\n`,
  );

  await writeFile(
    path('libs/websockets/ws-jwt.guard.ts'),
    WS_JWT_GUARD_SOURCE,
    'utf8',
  );
  await writeFile(
    path('libs/websockets/ws-roles.guard.ts'),
    WS_ROLES_GUARD_SOURCE,
    'utf8',
  );
  await writeFile(
    path('libs/websockets/authenticated-socket.ts'),
    AUTHENTICATED_SOCKET_SOURCE,
    'utf8',
  );
  await writeFile(
    path('libs/websockets/index.ts'),
    "export * from './authenticated-socket';\nexport * from './ws-jwt.guard';\nexport * from './ws-roles.guard';\n",
    'utf8',
  );

  await writeFile(
    path('src/features/notificaciones/notificaciones.gateway.ts'),
    NOTIFICACIONES_GATEWAY_SOURCE,
    'utf8',
  );
  await writeFile(
    path('src/features/notificaciones/notificaciones.module.ts'),
    NOTIFICACIONES_MODULE_SOURCE,
    'utf8',
  );

  await wireFeatureModuleIntoAppModule(
    'NotificacionesModule',
    './features/notificaciones/notificaciones.module',
  );

  // `libs/*` aliases are listed explicitly (not a single `@app/*` wildcard) in
  // tsconfig.json's `paths` (tsconfig.build.json extends it) — register the
  // new lib so `@app/websockets` resolves for tsc, ESLint, and IDEs.
  const tsconfigAlias =
    '      "@app/observability": ["./libs/observability"],\n      "@app/observability/*": ["./libs/observability/*"]';
  const tsconfigAliasWithWebsockets =
    '      "@app/observability": ["./libs/observability"],\n      "@app/observability/*": ["./libs/observability/*"],\n      "@app/websockets": ["./libs/websockets"],\n      "@app/websockets/*": ["./libs/websockets/*"]';
  await edit('tsconfig.json', (c) =>
    c.includes('@app/websockets')
      ? c
      : c.replace(tsconfigAlias, tsconfigAliasWithWebsockets),
  );
}

/**
 * Adds a Redis-transported, event-driven microservice hybrid app alongside
 * the existing HTTP server, with one example `@EventPattern` slice.
 */
async function addMicroservice(): Promise<void> {
  await mkdir(path('src/features/eventos/procesar-evento'), {
    recursive: true,
  });

  await writeFile(
    path('src/features/eventos/procesar-evento/procesar-evento.dto.ts'),
    PROCESAR_EVENTO_DTO_SOURCE,
    'utf8',
  );
  await writeFile(
    path('src/features/eventos/procesar-evento/procesar-evento.handler.ts'),
    PROCESAR_EVENTO_HANDLER_SOURCE,
    'utf8',
  );
  await writeFile(
    path('src/features/eventos/procesar-evento/procesar-evento.spec.ts'),
    PROCESAR_EVENTO_SPEC_SOURCE,
    'utf8',
  );
  await writeFile(
    path('src/features/eventos/eventos.module.ts'),
    EVENTOS_MODULE_SOURCE,
    'utf8',
  );

  await wireFeatureModuleIntoAppModule(
    'EventosModule',
    './features/eventos/eventos.module',
  );

  await edit('env/env.schema.ts', (c) =>
    c.includes('REDIS_HOST')
      ? c
      : c.replace(
          '    // ---- Authentication (dual strategy) -----------------------------------',
          '    // ---- Event-driven microservice (Redis transporter) --------------------\n' +
            "    REDIS_HOST: z.string().default('localhost'),\n" +
            '    REDIS_PORT: z.coerce.number().int().positive().default(6379),\n\n' +
            '    // ---- Authentication (dual strategy) -----------------------------------',
        ),
  );

  await edit('src/main.ts', (c) =>
    c
      .replace(
        "import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';\n",
        "import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';\n" +
          "import { MicroserviceOptions, Transport } from '@nestjs/microservices';\n",
      )
      .replace(
        '  app.enableShutdownHooks();\n',
        '  app.enableShutdownHooks();\n\n' +
          '  // Event-driven microservice (Redis transporter) — added by `pnpm run init`.\n' +
          '  app.connectMicroservice<MicroserviceOptions>({\n' +
          '    transport: Transport.REDIS,\n' +
          "    options: { host: config.get('REDIS_HOST'), port: config.get('REDIS_PORT') },\n" +
          '  });\n' +
          '  await app.startAllMicroservices();\n',
      ),
  );
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

  if (answers.dbEngine === 'postgresql') {
    await applyPostgres();
  }

  if (!answers.includeAuth) await removeAuth();
  if (!answers.includeAppInsights) await removeAppInsights();

  await writeEnv(answers);
  s.stop('Configuration applied');

  s.start('Updating dependencies (pnpm)');
  await updateDependencies(answers);
  s.stop('Dependencies updated');

  if (
    answers.capabilities.includes('websockets') ||
    answers.capabilities.includes('microservice')
  ) {
    s.start('Scaffolding additional capabilities');
    if (answers.capabilities.includes('websockets')) await addWebsockets();
    if (answers.capabilities.includes('microservice')) await addMicroservice();
    s.stop('Additional capabilities scaffolded');
  }

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
    'docker compose up -d        # start the database',
    'pnpm prisma:generate',
    'pnpm prisma:migrate',
    answers.includeAuth
      ? 'pnpm run auth:token         # mint a local JWT'
      : null,
    answers.capabilities.includes('microservice')
      ? 'docker run -p 6379:6379 -d redis   # local Redis for the microservice transporter'
      : null,
    'pnpm start:dev',
  ].filter(Boolean) as string[];

  note(next.join('\n'), 'Next steps');
  outro(`✅ "${answers.projectName}" is ready. Happy building!`);
}

// --------------------------------------------------------------------------
// Capability templates
// --------------------------------------------------------------------------

/**
 * Verifies a raw JWT string outside the HTTP/Passport pipeline — for
 * transports where there's no Authorization header to hook into (WebSocket
 * handshakes, message-queue consumers, etc.). Mirrors the exact dual-mode
 * logic in `JwtStrategy` (`jwt.strategy.ts`): local HS256 in dev/CI, Azure AD
 * JWKS RS256 otherwise.
 */
const VERIFY_TOKEN_SOURCE = `import { UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import JwksClient from 'jwks-rsa';

import type { AuthenticatedUser } from '@app/common';
import { AppConfigService } from '@app/config';

interface JwtPayload {
  sub: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  roles?: string[];
  [claim: string]: unknown;
}

// \`jwks-rsa\`'s default export is a factory *function* (call it, don't \`new\` it)
// that returns a \`JwksClient\` instance — same package the HTTP \`JwtStrategy\`
// already uses via its \`passportJwtSecret\` helper.
let jwksClientCache: ReturnType<typeof JwksClient> | null = null;

function getJwksClient(config: AppConfigService): ReturnType<typeof JwksClient> {
  jwksClientCache ??= JwksClient({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 10,
    jwksUri: config.azureAdJwksUri,
  });
  return jwksClientCache;
}

/**
 * Verifies a raw JWT string using the same dual-mode rules as the HTTP
 * \`JwtStrategy\`: local HS256 secret in dev/CI, Azure AD JWKS RS256 otherwise.
 */
export async function verifyToken(
  token: string,
  config: AppConfigService,
): Promise<AuthenticatedUser> {
  const payload = config.useLocalMockAuth
    ? verifyLocal(token, config)
    : await verifyAzureAd(token, config);

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

function verifyLocal(token: string, config: AppConfigService): JwtPayload {
  try {
    return jwt.verify(token, config.get('LOCAL_JWT_SECRET') as string, {
      algorithms: ['HS256'],
    }) as JwtPayload;
  } catch {
    throw new UnauthorizedException('Invalid or expired token.');
  }
}

async function verifyAzureAd(
  token: string,
  config: AppConfigService,
): Promise<JwtPayload> {
  const decoded = jwt.decode(token, { complete: true });
  const kid = decoded?.header.kid;
  if (!decoded || !kid) {
    throw new UnauthorizedException('Invalid token header.');
  }

  const signingKey = await getJwksClient(config).getSigningKey(kid);

  try {
    return jwt.verify(token, signingKey.getPublicKey(), {
      algorithms: ['RS256'],
      audience: config.get('AZURE_AD_AUDIENCE'),
      issuer: config.azureAdIssuer,
    }) as JwtPayload;
  } catch {
    throw new UnauthorizedException('Invalid or expired token.');
  }
}
`;

/**
 * Socket.IO types \`Socket.data\` as \`any\`. Intersecting \`Socket & { data: X }\`
 * does **not** narrow it — TypeScript collapses \`any & X\` back to \`any\` — so
 * \`Omit\` the original \`data\` field first, then add the narrowed one back.
 */
const AUTHENTICATED_SOCKET_SOURCE = `import type { Socket } from 'socket.io';

import type { AuthenticatedUser } from '@app/common';

/**
 * A Socket.IO client augmented with the principal \`WsJwtGuard\` attaches after
 * validating the handshake JWT. Use this type (instead of intersecting
 * \`Socket\` directly) anywhere you read \`client.data.user\`.
 */
export type AuthenticatedSocket = Omit<Socket, 'data'> & {
  data: { user?: AuthenticatedUser };
};
`;

/** WS counterpart of \`JwtAuthGuard\` — not global, apply with \`@UseGuards()\`. */
const WS_JWT_GUARD_SOURCE = `import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { verifyToken } from '@app/auth';
import { AppConfigService } from '@app/config';

import type { AuthenticatedSocket } from './authenticated-socket';

/**
 * Validates the JWT sent during the Socket.IO handshake — either
 * \`socket.handshake.auth.token\` (recommended: \`io(url, { auth: { token } })\`)
 * or a Bearer \`Authorization\` header — reusing the same dual-mode
 * verification as the HTTP \`JwtStrategy\` (see \`libs/auth/verify-token.ts\`).
 * Attaches the resolved principal to \`socket.data.user\`.
 *
 * Unlike \`JwtAuthGuard\`, this is **not** global — WebSocket gateways don't go
 * through the global HTTP guard chain, so apply it explicitly:
 * \`@UseGuards(WsJwtGuard)\` on the gateway class.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    const token = this.extractToken(client);
    if (!token) {
      throw new UnauthorizedException('Missing WebSocket auth token.');
    }

    client.data.user = await verifyToken(token, this.config);
    return true;
  }

  private extractToken(client: AuthenticatedSocket): string | undefined {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    if (fromAuth) return fromAuth;

    const header = client.handshake.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  }
}
`;

/** WS counterpart of \`RolesGuard\` — reads \`client.data.user\` instead of an HTTP request. */
const WS_ROLES_GUARD_SOURCE = `import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '@app/common';

import type { AuthenticatedSocket } from './authenticated-socket';

/**
 * WS counterpart of the HTTP \`RolesGuard\`. NestJS's global HTTP guards
 * assume \`switchToHttp()\`, so they don't apply to WebSocket contexts — apply
 * this explicitly with \`@UseGuards(WsJwtGuard, WsRolesGuard)\` (in that order)
 * on any gateway that needs \`@Roles(...)\` enforcement.
 */
@Injectable()
export class WsRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    const hasRole = client.data.user?.roles?.some((role: string) =>
      requiredRoles.includes(role),
    );
    if (!hasRole) {
      throw new ForbiddenException(
        \`Access denied. Requires one of: \${requiredRoles.join(', ')}.\`,
      );
    }
    return true;
  }
}
`;

/** Example real-time slice, added by \`pnpm run init\` when WebSockets is selected. */
const NOTIFICACIONES_GATEWAY_SOURCE = `import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server } from 'socket.io';

import { Roles } from '@app/common';
import { WsJwtGuard, WsRolesGuard, type AuthenticatedSocket } from '@app/websockets';

interface EnviarNotificacionPayload {
  destinatarioId: string;
  mensaje: string;
}

/**
 * Example real-time slice — mirrors the VSA shape (one gateway per domain)
 * but for WebSocket messages instead of HTTP routes. Every connection is
 * authenticated via \`WsJwtGuard\` (same dual-mode JWT as the REST API);
 * \`client.data.user\` carries the authenticated principal, the WS equivalent
 * of \`@CurrentUser()\` on the HTTP side.
 */
@UseGuards(WsJwtGuard)
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class NotificacionesGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('notificaciones:suscribir')
  suscribir(@ConnectedSocket() client: AuthenticatedSocket): void {
    // TODO: reemplaza con la lógica real (validar acceso a la sala, etc.).
    // \`client.data.user\` is guaranteed set — \`WsJwtGuard\` runs before this handler.
    void client.join(\`usuario:\${client.data.user!.userId}\`);
  }

  @UseGuards(WsRolesGuard)
  @Roles('Admin')
  @SubscribeMessage('notificaciones:enviar')
  enviar(@MessageBody() payload: EnviarNotificacionPayload): void {
    // TODO: reemplaza con la lógica real de envío/persistencia.
    this.server
      .to(\`usuario:\${payload.destinatarioId}\`)
      .emit('notificaciones:nueva', { mensaje: payload.mensaje });
  }
}
`;

const NOTIFICACIONES_MODULE_SOURCE = `import { Module } from '@nestjs/common';

import { NotificacionesGateway } from './notificaciones.gateway';

/**
 * Módulo del dominio Notificaciones — gateways son \`providers\`, no
 * \`controllers\` (no son endpoints HTTP).
 */
@Module({
  providers: [NotificacionesGateway],
})
export class NotificacionesModule {}
`;

/** Example event-driven slice, added by \`pnpm run init\` when the microservice capability is selected. */
const PROCESAR_EVENTO_DTO_SOURCE = `import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const ProcesarEventoSchema = z.object({
  tipo: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export class ProcesarEventoDto extends createZodDto(ProcesarEventoSchema) {}
`;

const PROCESAR_EVENTO_HANDLER_SOURCE = `import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RedisContext } from '@nestjs/microservices';

import { ProcesarEventoDto } from './procesar-evento.dto';

/**
 * Example event-driven slice. \`@EventPattern\` handlers are the message-queue
 * equivalent of an HTTP handler in this VSA template: same file layout
 * (handler + dto + spec), triggered by a Redis pub/sub message instead of an
 * HTTP request — so there's no \`ApiEnvelope\` here, just the side effect.
 */
@Controller()
export class ProcesarEventoHandler {
  private readonly logger = new Logger(ProcesarEventoHandler.name);

  @EventPattern('eventos.procesar')
  procesar(@Payload() payload: ProcesarEventoDto, @Ctx() context: RedisContext): void {
    // TODO: reemplaza con la lógica real de procesamiento del evento.
    this.logger.log(
      \`Evento recibido en "\${context.getChannel()}": \${JSON.stringify(payload)}\`,
    );
  }
}
`;

const PROCESAR_EVENTO_SPEC_SOURCE = `import { Test } from '@nestjs/testing';

import { ProcesarEventoHandler } from './procesar-evento.handler';

describe('ProcesarEventoHandler', () => {
  let handler: ProcesarEventoHandler;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ProcesarEventoHandler],
    }).compile();

    handler = module.get(ProcesarEventoHandler);
  });

  it('está definido', () => {
    expect(handler).toBeDefined();
  });

  it.todo('implementa el procesamiento real del evento');
});
`;

const EVENTOS_MODULE_SOURCE = `import { Module } from '@nestjs/common';

import { ProcesarEventoHandler } from './procesar-evento/procesar-evento.handler';

/**
 * Módulo del dominio Eventos (Vertical Slice Architecture) — handlers de
 * mensajería en lugar de HTTP, mismo patrón de carpeta por acción.
 */
@Module({
  controllers: [ProcesarEventoHandler],
})
export class EventosModule {}
`;

run().catch((error: unknown) => {
  cancel(
    `Initialization failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
