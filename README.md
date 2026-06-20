# NestJS Enterprise Template

Enterprise-grade, cloud-native (**Azure-ready**) NestJS microservice template for 2026.
Clean Architecture + SOLID, Fastify, Prisma 7, Zod v4, structured logging, dual-mode
JWT auth (Azure AD / local mock), Swagger, and an interactive initializer.

> **First time here?** Run `pnpm install && pnpm run init` and answer the prompts — the
> CLI tailors the template to your project and deletes itself.

---

## ✨ Stack & 2026 highlights

| Area            | Choice                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Framework       | NestJS 11 on **Fastify** (higher throughput, lower memory than Express) |
| Language        | TypeScript (full **strict** mode) on Node 22                           |
| Validation      | **Zod v4** for env **and** DTOs via `nestjs-zod` (`z.toJSONSchema` → OpenAPI) |
| ORM             | **Prisma 7** — pure-TypeScript client (no Rust engine) + driver adapters |
| Logging         | `nestjs-pino` — JSON in prod, pretty in dev, correlation ids          |
| Auth            | Passport-JWT, **dual mode**: Azure AD JWKS (`jwks-rsa`) / local HS256  |
| Docs            | Swagger/OpenAPI with Bearer auth, strict decorators                   |
| Observability   | `@azure/monitor-opentelemetry` + Terminus health probes              |
| Local infra     | **OrbStack**-optimized `docker-compose` (SQL Server 2022)             |
| Package manager | `pnpm`                                                                 |

## 🏗️ Architecture

Shared, framework-light building blocks live in `libs/` and are imported through
`@app/*` path aliases. Feature modules in `src/modules/` follow Clean Architecture.

```
src/
  instrumentation? (in libs)        # OTel init, imported first in main.ts
  main.ts                           # Fastify bootstrap, Swagger, global pipe/filter
  app.module.ts                     # composition root
  modules/users/                    # example vertical slice
    domain/        user.entity.ts · user.repository.ts (port)
    application/   dto/ (Zod) · use-cases/
    infrastructure/ prisma-user.repository.ts (adapter)
    users.controller.ts · users.module.ts
libs/
  config/         @app/config        # Zod env schema + typed ConfigService
  common/         @app/common        # error filter, interceptors, RBAC decorators, pagination
  auth/           @app/auth          # dual JWT strategy + global guards
  database/       @app/database      # Prisma service/module
  logging/        @app/logging       # pino config
  observability/  @app/observability # health probes + Azure Monitor instrumentation
prisma/           schema.prisma · seed.ts
scripts/          init.ts · generate-mock-token.ts
```

**Dependency rule:** `app → libs`, never the reverse. Use cases depend on the
abstract `UserRepository` (port); Prisma is bound as the adapter in `users.module.ts`,
so swapping the database — or faking it in tests — touches exactly one provider.

## 🚀 Bootstrap (run these now)

```bash
# 1. Install dependencies
pnpm install

# 2. Tailor the template (renames, picks DB/auth/logging, prunes unused files)
pnpm run init

# 3. Start local SQL Server (OrbStack)
pnpm docker:up

# 4. Generate the Prisma client, apply schema, seed an admin user
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed

# 5. Run
pnpm start:dev
```

Then open **http://localhost:3000/docs**.

## 🔐 Testing auth locally (no Azure tenant needed)

With `USE_LOCAL_MOCK_AUTH=true` in `.env`, the JWT strategy verifies HS256 tokens
against `LOCAL_JWT_SECRET`. Mint one:

```bash
pnpm run auth:token                          # Admin token
pnpm run auth:token -- --roles=UserManager   # custom roles
```

Copy the token into Swagger's **Authorize** dialog and call the RBAC-protected
`/api/users` endpoints. The payload mimics an Entra ID token (`sub`, `email`,
`roles`, `oid`, `tid`), so switching to real Azure AD later is a config change only:
set `USE_LOCAL_MOCK_AUTH=false` and provide `AZURE_AD_TENANT_ID` + `AZURE_AD_AUDIENCE`.

## 🩺 Health & observability

- `GET /health` — liveness (process up)
- `GET /health/ready` — readiness (database reachable)

Set `APPLICATIONINSIGHTS_CONNECTION_STRING` to stream distributed traces, metrics
and correlated logs to Azure Monitor. Unset, instrumentation is a no-op.

## 📜 Useful scripts

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `pnpm start:dev`       | Watch mode (tsx, resolves `@app/*`)      |
| `pnpm build`           | `nest build` + `tsc-alias` (prod bundle) |
| `pnpm typecheck`       | `tsc --noEmit` (strict)                  |
| `pnpm test` / `:e2e`   | Unit / end-to-end tests                  |
| `pnpm run auth:token`  | Generate a local mock JWT                |
| `pnpm prisma:studio`   | Browse the database                      |
| `pnpm docker:up/down`  | Start/stop local infrastructure          |

## ☁️ Cloud-native notes

- **Stateless** — no in-process session state; scale horizontally.
- **Config from environment** — validated at boot; use Azure App Settings / Key Vault.
- **Graceful shutdown** — `enableShutdownHooks()` drains connections on `SIGTERM`.
- **Container** — multi-stage, non-root, prod-only deps; no Prisma engine binary.

Built with NestJS, Prisma, Zod and Fastify.
