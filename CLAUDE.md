# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository. **Read
this before writing code.** For deeper rationale see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Project summary

Enterprise-grade, cloud-native (Azure-ready) **NestJS 11 microservice template**
built on **Fastify**, **Prisma 7** (pure-TS client, SQL Server driver adapter),
**Zod v4**, and **nestjs-pino**. It follows **Vertical Slice Architecture (VSA)**:
cada operación del dominio es un slice autónomo con localidad de referencia total.

- Feature slices: `src/features/<dominio>/<accion>/` — endpoint, lógica, DTOs y tests juntos.
- Shared building blocks: `libs/*`, imported via the `@app/*` path alias.
- Environment schema + per-stage files: `env/`, imported via the `@env` alias.
- Package manager: **pnpm** (Node ≥ 22).

## Commands

```bash
pnpm install                 # install deps
pnpm start:dev               # run with watch (APP_ENV selects env/.env.<stage>)
pnpm build                   # nest build + tsc-alias (resolves @app/@env aliases)
pnpm test                    # jest unit tests (*.spec.ts)
pnpm test:e2e                # jest e2e (test/*.e2e-spec.ts)
pnpm typecheck               # tsc --noEmit (strict)
pnpm lint                    # eslint --fix
pnpm auth:token              # generate a local HS256 mock JWT
pnpm prisma:generate         # regenerate Prisma client
pnpm prisma:migrate          # create/apply a dev migration
pnpm docker:up / docker:down # SQL Server via docker compose
```

Always run `pnpm typecheck` and `pnpm test` after a change; run `pnpm test:e2e`
when touching bootstrap, guards, filters, or interceptors.

## Non-negotiable architectural rules

1. **Vertical Slice Architecture — estructura por acción, no por capa.**
   - Cada operación CRUD vive en `src/features/<dominio>/<accion>/`.
   - Dentro de la subcarpeta del slice van: el handler (`*.handler.ts`), los Zod
     DTOs (`*.dto.ts`) y la spec (`*.spec.ts`). Todo junto, sin subdirectorios.
   - No se usan capas `domain/`, `application/`, `infrastructure/` dentro de features.
   - Dependency flow is **`src → libs`, never `libs → src`**.

2. **Inyección directa de Prisma.** `PrismaService` se inyecta directamente en
   el constructor del handler. No se crean repositorios ni interfaces abstractas
   entre el handler y la base de datos.

3. **Excepciones nativas de NestJS.** Lanza `NotFoundException`, `ConflictException`,
   etc., directamente desde el handler. No uses subclases `DomainException`.

4. **Fastify, not Express.** The app uses `@nestjs/platform-fastify`
   (`NestFastifyApplication`, `FastifyAdapter`). Do not add Express-only
   middleware/APIs or `@nestjs/platform-express`.

5. **Zod for all validation.** Every DTO is a Zod schema via `createZodDto`
   (`nestjs-zod`); the global `ZodValidationPipe` validates them. Environment is
   validated by `env/env.schema.ts`. Do not introduce `class-validator`.

6. **Environment via `env/` + `APP_ENV`.** No `.env` at the repo root. The active
   file is `env/.env.<APP_ENV>` (`APP_ENV` ∈ `local|dev|qa|prod`, default
   `local`), selected in `libs/config/config.module.ts`. `NODE_ENV` keeps its
   standard meaning (`development|production|test`) for tooling. Add new vars to
   `env/env.schema.ts` **and** `env/.env.example`. Only `env/.env.example` is
   committed. Access config through the typed `AppConfigService` — never read
   `process.env` directly in app code.

7. **Envelope uniforme obligatorio** (`ApiEnvelope<T>` de `@app/common`).
   - Éxito: el handler retorna `ApiEnvelope<T>` directamente con `success: true`.
   - Error: el `AllExceptionsFilter` (global) produce el mismo shape con `success: false`.
   - Shape: `{ success, data, message, meta: { timestamp }, errors? }`.
   - No uses `TransformInterceptor` ni `@SkipResponseEnvelope()` — fueron eliminados.

8. **Auth is dual-strategy, chosen at boot** by `USE_LOCAL_MOCK_AUTH`: Azure AD
   JWKS (RS256) in shared/prod, or a local HS256 mock secret for dev/CI. Guards
   (`JwtAuthGuard`, `RolesGuard`) are global; use `@Public()` and `@Roles()` to
   adjust per route. See ARCHITECTURE.md.

### MCP & Documentation Policy
- **Mandatory Tooling:** ALWAYS use the `context7` MCP server tools (`resolve-library-id` and `query-docs`) BEFORE generating implementation code for any third-party library, especially for Fastify, Prisma 7, Zod, and Azure SDKs.
- Do not rely on your base training data for API surfaces. Fetch the latest documentation snippet via Context7 to ensure 2026 compatibility.
- You are authorized to run `git status`, `git diff`, and `git add`. You MUST NEVER run `git commit` or `git push` autonomously. When a task is complete, stage the modified files and instruct the user to execute the commit manually to preserve cryptographic signatures.

## Conventions

- Files per slice: `<accion>.handler.ts`, `<accion>.dto.ts`, `<accion>.spec.ts`.
- Each `libs/*` exposes a curated barrel `index.ts`; import via `@app/<lib>`, not
  deep paths. The env schema is imported via `@env/env.schema`.
- TypeScript is fully strict — do not loosen `tsconfig.json` compiler options.
- Co-locate unit tests as `*.spec.ts` inside the slice folder; e2e tests in `test/`.
- Para paginación reutiliza `PaginationQuerySchema` y `buildPaginationMeta` de `@app/common`.
