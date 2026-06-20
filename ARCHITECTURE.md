# Architecture

A reference for humans and AI agents. The enforceable rules are summarised in
[CLAUDE.md](./CLAUDE.md) and [.cursorrules](./.cursorrules); this document
explains the *why* and the cross-cutting standards.

## Stack

| Concern        | Choice                                                    |
| -------------- | --------------------------------------------------------- |
| Framework      | NestJS 11 on **Fastify** (`@nestjs/platform-fastify`)     |
| Validation     | **Zod v4** (`nestjs-zod`) — env + DTOs                     |
| ORM            | **Prisma 7** (pure-TS client) + `@prisma/adapter-mssql`   |
| Logging        | **nestjs-pino** (JSON in prod, pretty in dev, correlation ids) |
| Auth           | Passport JWT — dual strategy (Azure AD JWKS / local HS256) |
| Observability  | Terminus health probes + Azure Monitor OpenTelemetry      |
| Runtime        | Node ≥ 22, pnpm                                            |

## Layers (Clean Architecture)

Feature code is organised as **vertical slices** under `src/modules/<feature>/`.
Cross-cutting infrastructure lives in `libs/*` (imported via `@app/*`). The
dependency rule is strict and one-directional — outer layers depend on inner
layers, never the reverse, and `src → libs` only.

```
src/modules/users/
├── domain/                 # Innermost. Pure TypeScript, zero framework deps.
│   ├── user.entity.ts      #   Entity / aggregate with business invariants.
│   └── user.repository.ts  #   Port: abstract class used as a DI token.
├── application/            # Use-cases orchestrate the domain via ports.
│   ├── dto/                #   Zod DTOs (createZodDto) — request/response shapes.
│   └── use-cases/          #   One class per command/query (single responsibility).
├── infrastructure/         # Adapters that implement domain ports.
│   ├── prisma-user.repository.ts     # Prisma-backed adapter.
│   └── in-memory-user.repository.ts  # Fake for tests.
├── users.controller.ts     # Presentation: HTTP only; delegates to use-cases.
└── users.module.ts         # Wires port → adapter for the slice.
```

- **Domain** holds business rules; it must not import NestJS, Prisma, or Fastify.
- **Application** depends only on domain **ports** (abstract classes), never on a
  concrete adapter — this keeps it testable with in-memory fakes.
- **Infrastructure** is where frameworks and I/O live; it implements the ports.
- **Presentation** (controllers) validates input (Zod), enforces RBAC, and maps
  to/from use-cases. No business logic.

`libs/` modules (`@app/config`, `@app/common`, `@app/auth`, `@app/database`,
`@app/logging`, `@app/observability`) are framework-aware shared kernels wired
once in `src/app.module.ts`.

## Environment management (`env/` + `APP_ENV`)

There is **no `.env` at the repository root**. All environment concerns live in
`env/`:

```
env/
├── env.schema.ts   # Zod v4 schema — single source of truth (imported via @env/env.schema)
├── .env.example    # Documented template — the ONLY committed env file
├── .env.local      # APP_ENV=local  (git-ignored)
├── .env.dev        # APP_ENV=dev    (git-ignored)
├── .env.qa         # APP_ENV=qa     (git-ignored)
└── .env.prod       # APP_ENV=prod   (git-ignored)
```

- **`APP_ENV`** (`local|dev|qa|prod`, default `local`) selects which file
  `libs/config/config.module.ts` loads at boot: `env/.env.${APP_ENV}`. A missing
  file is ignored — in cloud environments values come from platform settings
  (Azure App Settings / Key Vault) and no file is present.
- **`NODE_ENV`** is intentionally *separate*; it keeps its standard meaning
  (`development|production|test`) for NestJS, pino, and Jest. Do not overload it
  as the stage selector.
- The merged environment is validated **once at boot** by `validateEnv` (fail
  fast, aggregated errors). Access values through the typed `AppConfigService`
  (`@app/config`) — never `process.env` in application code.
- Adding a variable = update `env/env.schema.ts` **and** `env/.env.example`.

## Error handling — RFC 7807 Problem Details

All exceptions are caught by `libs/common/filters/all-exceptions.filter.ts` and
returned as `application/problem+json` following
[RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807). Core members are
`type`, `title`, `status`, `detail`, `instance`; spec-sanctioned extension
members add `code`, `errors`, `correlationId`, and `timestamp`. The filter logs
the error (with stack) through the structured pino logger before responding —
`error` for ≥500, `warn` for 4xx.

Mapping:

| Source                              | Status      | `code`              |
| ----------------------------------- | ----------- | ------------------- |
| `ZodValidationException`            | 400         | `VALIDATION_ERROR` (+ `errors[]`) |
| `DomainException` subclasses        | its status  | e.g. `USER_NOT_FOUND` |
| `Prisma.PrismaClientKnownRequestError` | mapped (P2025→404, P2002/P2003→409, …) | `PRISMA_<code>` |
| other `HttpException`               | its status  | status name         |
| anything else                       | 500         | `INTERNAL_SERVER_ERROR` (no internals leaked) |

Example (validation failure):

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Request validation failed.",
  "instance": "/api/users",
  "code": "VALIDATION_ERROR",
  "errors": [{ "path": "email", "message": "Invalid email", "code": "invalid_string" }],
  "correlationId": "req-abc123",
  "timestamp": "2026-06-20T10:30:00.000Z"
}
```

Domain/application code should **throw** `DomainException` subclasses
(`EntityNotFoundException`, `EntityConflictException`, `BusinessRuleException`)
rather than build HTTP responses.

## Success responses — `{ data, meta }` envelope

The global `TransformInterceptor` (`libs/common/interceptors/`) wraps every
successful response:

- Single resource → `{ "data": <payload> }`.
- Collection/paginated → use-cases return `{ items, meta }` (built with
  `buildPaginationMeta` from `@app/common`); the interceptor hoists this to
  `{ "data": [...], "meta": { total, page, limit, totalPages, hasNextPage, hasPreviousPage } }`.
- Routes with a fixed external contract opt out via `@SkipResponseEnvelope()`
  (e.g. Terminus health probes, which must keep `{ status, info, details }`).

## Dual-strategy authentication

A single Passport JWT strategy (`libs/auth/jwt.strategy.ts`) selects its mode at
**boot** (never per request) from `USE_LOCAL_MOCK_AUTH`:

- **Azure AD (default, shared/prod):** validates `RS256` signatures against the
  tenant's JWKS endpoint, checking `audience` (`AZURE_AD_AUDIENCE`) and `issuer`.
  Requires `AZURE_AD_TENANT_ID` + `AZURE_AD_AUDIENCE` (optional `AZURE_AD_ISSUER`).
- **Local mock (`USE_LOCAL_MOCK_AUTH=true`, dev/CI):** validates `HS256` against
  `LOCAL_JWT_SECRET`. Generate a token with `pnpm auth:token`. The payload mirrors
  the Entra ID claim shape so RBAC works offline.

Claims are mapped to a provider-agnostic `AuthenticatedUser`. Guards are global:
`JwtAuthGuard` enforces authentication (bypass with `@Public()`), `RolesGuard`
enforces `@Roles(...)` (any-of match). Inject the principal with `@CurrentUser()`.

## Testing

- Unit tests are co-located as `*.spec.ts`; use-cases are tested against
  in-memory fake repositories (no I/O).
- E2E smoke tests live in `test/*.e2e-spec.ts`, booting the full Fastify graph
  with `PrismaService` stubbed. Health probes return their raw shape (excluded
  from the envelope); feature routes are guarded (401 without a token).
- Run `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` before merging.
