# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository. **Read
this before writing code.** For deeper rationale see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Project summary

Enterprise-grade, cloud-native (Azure-ready) **NestJS 11 microservice template**
built on **Fastify**, **Prisma 7** (pure-TS client, SQL Server driver adapter),
**Zod v4**, and **nestjs-pino**. It follows **Clean Architecture** with vertical
feature slices and a strict dependency direction.

- Feature code: `src/modules/<feature>/` (domain → application → infrastructure → presentation).
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

1. **Clean Architecture dependency direction — never violate it.**
   - `domain/` is pure TypeScript: entities + ports (abstract classes as DI
     tokens). **No** NestJS, Prisma, Fastify, or other framework imports.
   - `application/` (use-cases, DTOs) depends only on `domain` ports — never on a
     concrete adapter.
   - `infrastructure/` implements ports (e.g. `prisma-user.repository.ts`).
   - presentation (`*.controller.ts`) handles HTTP only; it delegates to use-cases.
   - Dependency flow is **`src → libs`, never `libs → src`**, and within a module
     domain → application → infrastructure/presentation (inward only).

2. **Fastify, not Express.** The app uses `@nestjs/platform-fastify`
   (`NestFastifyApplication`, `FastifyAdapter`). Do not add Express-only
   middleware/APIs or `@nestjs/platform-express`.

3. **Zod for all validation.** Every DTO is a Zod schema via `createZodDto`
   (`nestjs-zod`); the global `ZodValidationPipe` validates them. Environment is
   validated by `env/env.schema.ts`. Do not introduce `class-validator`.

4. **Environment via `env/` + `APP_ENV`.** No `.env` at the repo root. The active
   file is `env/.env.<APP_ENV>` (`APP_ENV` ∈ `local|dev|qa|prod`, default
   `local`), selected in `libs/config/config.module.ts`. `NODE_ENV` keeps its
   standard meaning (`development|production|test`) for tooling. Add new vars to
   `env/env.schema.ts` **and** `env/.env.example`. Only `env/.env.example` is
   committed. Access config through the typed `AppConfigService` — never read
   `process.env` directly in app code.

5. **Errors: RFC 7807 Problem Details.** All errors flow through
   `libs/common/filters/all-exceptions.filter.ts`, which emits
   `application/problem+json` with `type/title/status/detail/instance` (+ `code`,
   `errors`, `correlationId`, `timestamp`). Throw `DomainException` subclasses
   (`EntityNotFoundException`, `EntityConflictException`, `BusinessRuleException`)
   from domain/application code — do not hand-format error responses.

6. **Success responses: `{ data, meta }` envelope.** The global
   `TransformInterceptor` wraps every successful response. Paginated use-cases
   return `{ items, meta }` (via `buildPaginationMeta`) and are hoisted to
   `{ data: items, meta }`. Opt a route out only with `@SkipResponseEnvelope()`
   (used by health probes).

7. **Auth is dual-strategy, chosen at boot** by `USE_LOCAL_MOCK_AUTH`: Azure AD
   JWKS (RS256) in shared/prod, or a local HS256 mock secret for dev/CI. Guards
   (`JwtAuthGuard`, `RolesGuard`) are global; use `@Public()` and `@Roles()` to
   adjust per route. See ARCHITECTURE.md.

   ### MCP & Documentation Policy
- **Mandatory Tooling:** ALWAYS use the `context7` MCP server tools (`resolve-library-id` and `query-docs`) BEFORE generating implementation code for any third-party library, especially for Fastify, Prisma 7, Zod, and Azure SDKs.
- Do not rely on your base training data for API surfaces. Fetch the latest documentation snippet via Context7 to ensure 2026 compatibility.

## Conventions

- Files: `*.entity.ts`, `*.repository.ts` (port) / `<tech>-*.repository.ts`
  (adapter), `*.use-case.ts`, `*.controller.ts`, `*.dto.ts`, `*.guard.ts`.
- Each `libs/*` exposes a curated barrel `index.ts`; import via `@app/<lib>`, not
  deep paths. The env schema is imported via `@env/env.schema`.
- TypeScript is fully strict — do not loosen `tsconfig.json` compiler options.
- Co-locate unit tests as `*.spec.ts` next to the code; e2e tests in `test/`.
