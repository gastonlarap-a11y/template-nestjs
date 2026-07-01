# Architecture

A reference for humans and AI agents. The enforceable rules are summarised in
[CLAUDE.md](./CLAUDE.md) and [.cursorrules](./.cursorrules); this document
explains the *why* and the cross-cutting standards. All three must stay in sync.

## Stack

| Concern        | Choice                                                    |
| -------------- | --------------------------------------------------------- |
| Framework      | NestJS 11 on **Fastify** (`@nestjs/platform-fastify`)     |
| Validation     | **Zod v4** (`nestjs-zod`) — env + DTOs                     |
| ORM            | **Prisma 7** (pure-TS client) + `@prisma/adapter-mssql` / `@prisma/adapter-pg` |
| Logging        | **nestjs-pino** (JSON in prod, pretty in dev, correlation ids) |
| Auth           | Passport JWT — dual strategy (Azure AD JWKS / local HS256) |
| Observability  | Terminus health probes + Azure Monitor OpenTelemetry      |
| Runtime        | Node ≥ 24 (current Active LTS), pnpm 11                    |

## Vertical Slice Architecture (VSA)

Feature code is organised as **vertical slices**, one per domain action, under
`src/features/<dominio>/<accion>/`. There are no `domain/`, `application/`, or
`infrastructure/` layers, no repository/port abstraction, and no use-case
classes — each slice is a small, self-contained controller that talks to
Prisma directly. Cross-cutting infrastructure lives in `libs/*` (imported via
`@app/*`). The dependency rule is `src → libs` only, never the reverse.

```
src/features/usuarios/
├── usuarios.module.ts               # Registers every slice handler as a controller.
├── crear-usuario/
│   ├── crear-usuario.handler.ts     # Controller + business logic + Prisma calls.
│   ├── crear-usuario.dto.ts         # Zod request/response schemas (createZodDto).
│   └── crear-usuario.spec.ts        # Unit test, PrismaService mocked.
├── listar-usuarios/                 # Same three-file shape, one per action:
├── obtener-usuario/                 #   handler + dto + spec, nothing else.
├── actualizar-usuario/
└── eliminar-usuario/
```

- **Locality of behaviour**: everything a slice needs (endpoint, validation,
  business rules, DB access) lives in one folder, so a change to "create user"
  never requires touching files scattered across layers.
- **`PrismaService` is injected directly** into the handler's constructor
  (rule: no repositories, no ports, no DI indirection between the handler and
  the database). This is a deliberate trade-off: it optimises for the common
  case (CRUD-shaped features) over swappable persistence, which this template
  does not need.
- **Domain modules** (`UsuariosModule`) are the only grouping above the slice:
  one module per domain, wiring every action's handler as a `controller`.
- New slice? Run `pnpm new:slice <dominio> <accion>` to scaffold the three
  files with the correct boilerplate instead of copy-pasting `usuarios`.

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

## Error handling — native NestJS exceptions + uniform envelope

Handlers throw NestJS's **native** exceptions directly — `NotFoundException`,
`ConflictException`, `BadRequestException`, etc. There are no `DomainException`
subclasses and no hand-built error bodies. The global
`libs/common/filters/all-exceptions.filter.ts` (`AllExceptionsFilter`) catches
everything and normalises it into the same `ApiEnvelope` shape used by success
responses, logging through the structured pino logger before responding
(`error` for ≥500, `warn` for 4xx).

Mapping:

| Source                                    | Status                                                   | Notes |
| ------------------------------------------ | --------------------------------------------------------- | ----- |
| `ZodValidationException`                   | 400                                                       | `message: 'Error de validación'`, `errors[]` with `{ path, message, code }` |
| `Prisma.PrismaClientKnownRequestError`      | mapped (P2025→404, P2002/P2003→409, P2000→400, else 400)  | Message never leaks raw SQL |
| any `HttpException` (thrown by a handler)   | its own status                                            | e.g. `NotFoundException`, `ConflictException` |
| anything else (programmer error)            | 500                                                       | `'Ocurrió un error inesperado.'`, no internals leaked |

Example (validation failure):

```json
{
  "success": false,
  "data": null,
  "message": "Error de validación",
  "meta": { "timestamp": "2026-06-30T10:30:00.000Z" },
  "errors": [{ "path": "email", "message": "Invalid email", "code": "invalid_string" }]
}
```

## Success responses — the `ApiEnvelope<T>` contract

There is **no `TransformInterceptor`** and **no `@SkipResponseEnvelope()`**
decorator — both were removed. Every handler builds and returns its own
`ApiEnvelope<T>` directly (`libs/common/interfaces/api-envelope.interface.ts`):

```ts
interface ApiEnvelope<T = unknown> {
  success: boolean;
  data: T | null;
  message: string;
  meta: { timestamp: string };
  errors?: EnvelopeError[];
}
```

- Single resource → `{ success: true, data: <payload>, message, meta: { timestamp } }`.
- Paginated list → build `meta` with `buildPaginationMeta(total, { page, limit })`
  from `@app/common` and spread it alongside `timestamp`:
  `meta: { ...paginationMeta, timestamp }`. Reuse `PaginationQuerySchema` /
  `PaginationQueryDto` for the query DTO instead of hand-rolling one.
- Routes with a fixed external contract (e.g. Terminus health probes, which
  must keep Terminus's own `{ status, info, details }` shape) simply return
  that shape as-is — there is no opt-out decorator to reach for.

## Dual-strategy authentication

A single Passport JWT strategy (`libs/auth/jwt.strategy.ts`) selects its mode at
**boot** (never per request) from `USE_LOCAL_MOCK_AUTH`:

- **Azure AD (default, shared/prod):** validates `RS256` signatures against the
  tenant's JWKS endpoint, checking `audience` (`AZURE_AD_AUDIENCE`) and `issuer`.
  Requires `AZURE_AD_TENANT_ID` + `AZURE_AD_AUDIENCE` (optional `AZURE_AD_ISSUER`).
- **Local mock (`USE_LOCAL_MOCK_AUTH=true`, dev/CI):** validates `HS256` against
  `LOCAL_JWT_SECRET`. Generate a token with `pnpm auth:token`. The payload mirrors
  the Entra ID claim shape so RBAC works offline.

Claims are mapped to a provider-agnostic `AuthenticatedUser`. `JwtAuthGuard` and
`RolesGuard` are registered globally via `APP_GUARD` in `libs/auth/auth.module.ts`:
`JwtAuthGuard` enforces authentication (bypass with `@Public()`), `RolesGuard`
enforces `@Roles(...)` (any-of match). Inject the principal with `@CurrentUser()`.

## Testing

- Unit tests are co-located as `*.spec.ts` inside each slice folder. Mock
  `PrismaService` with `jest.mock('@app/database', () => ({ PrismaService: class {} }))`
  plus a `providers: [{ provide: PrismaService, useValue: mockPrisma }]` override
  — no I/O, no test database.
- E2E smoke tests live in `test/*.e2e-spec.ts`, booting the full Fastify graph.
  Health probes return their raw Terminus shape; feature routes are guarded
  (401 without a token).
- Run `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` before merging.

## Extending the template

- **New CRUD/API endpoint**: `pnpm new:slice <dominio> <accion>` scaffolds
  `handler.ts` + `dto.ts` + `spec.ts`; register the handler in the domain's
  `<Dominio>Module` `controllers` array (or let the generator do it if the
  module already exists).
- **WebSockets** (real-time features — chat, notifications, live updates): add
  a `<accion>.gateway.ts` inside the relevant slice folder using
  `@nestjs/websockets` + `@nestjs/platform-socket.io`. Reuse the existing JWT
  strategy for handshake auth (validate the token in a `WsException`-throwing
  guard) instead of inventing a parallel auth mechanism. Not included by
  default to avoid an unused dependency — add it via `pnpm run init`'s
  "additional capabilities" prompt or manually when the first real-time
  feature is needed.
- **Event-driven microservice** (async jobs, pub/sub, queue consumers): add
  `@nestjs/microservices` with a transporter (Redis, Azure Service Bus, etc.)
  as a hybrid app (`app.connectMicroservice(...)`) alongside the existing HTTP
  server, keeping the handler/dto/spec slice shape for message handlers too.
  Same rule as WebSockets — opt in via `pnpm run init` or when actually needed.
