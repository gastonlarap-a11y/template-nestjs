---
name: code-review
description: Reviews code changes in this NestJS VSA template for architecture-boundary violations, bugs, and convention drift. Use when reviewing PRs, a working diff, or checking code quality before commit.
---

# Code Review Skill — NestJS VSA Template

This repo follows Vertical Slice Architecture (see CLAUDE.md / ARCHITECTURE.md
/ .cursorrules — keep all three in sync if you spot drift). Review every diff
against the checklist below before the generic correctness/style pass.

## Architecture-boundary checklist (fail the review if violated)

1. **No layering inside a slice.** A change under `src/features/<dominio>/<accion>/`
   must only touch `<accion>.handler.ts`, `<accion>.dto.ts`, `<accion>.spec.ts`.
   Reject any new `domain/`, `application/`, `infrastructure/`, `*.entity.ts`,
   `*.repository.ts`, or `*.use-case.ts` file — those belong to the old Clean
   Architecture layout and must not reappear.
2. **Direct Prisma injection only.** The handler's constructor must inject
   `PrismaService` from `@app/database` and call it inline. Flag any
   repository/port abstraction reintroduced between the handler and Prisma.
3. **Native exceptions, not custom hierarchies.** Handlers must throw NestJS's
   built-in exceptions (`NotFoundException`, `ConflictException`,
   `BadRequestException`, …) directly. Flag any `DomainException` subclass or
   hand-built error response object — the global `AllExceptionsFilter` owns
   that shape.
4. **`ApiEnvelope<T>` returned directly.** Every handler method's return type
   must be `ApiEnvelope<T>` (or the paginated variant with a spread
   `PaginationMeta`), built and returned by the handler itself. Flag any use of
   `@SkipResponseEnvelope()` or a `TransformInterceptor` — both were removed
   from this codebase; their reappearance is a regression, not a feature.
5. **Zod DTOs only.** Request/response shapes must be Zod schemas via
   `createZodDto`. Reject `class-validator` / `class-transformer` decorators
   (`@IsString()`, `@IsEmail()`, etc.).
6. **`@app/*` / `@env/*` aliases, no deep relative imports across libs.** A
   `src/` file must never import from another `src/` internals path directly;
   shared code flows through `libs/*` via the `@app/*` alias. `libs/*` must
   never import from `src/*`.
7. **`process.env` never read directly in app code.** Config must go through
   `AppConfigService` (`@app/config`). New env vars need both
   `env/env.schema.ts` and `env/.env.example` updated in the same diff.
8. **Fastify only.** No `@nestjs/platform-express`, Express-only middleware,
   or Express-typed request/response objects.
9. **Pagination reuse.** A paginated list endpoint should use
   `PaginationQuerySchema` / `PaginationQueryDto` / `buildPaginationMeta` from
   `@app/common` rather than a hand-rolled query shape.
10. **RBAC present where expected.** Mutating/sensitive endpoints should carry
    `@Roles(...)` (or an explicit, justified `@Public()`); missing RBAC on a
    write endpoint is worth flagging even if not strictly a bug.

## General checklist

1. **Correctness**: Does the code do what it's supposed to?
2. **Edge cases**: Are error conditions, empty results, and race conditions
   (e.g. two requests creating the same unique record) handled?
3. **Tests**: Is there a co-located `*.spec.ts` covering the success path, the
   thrown-exception path, and any data-shape edge case (e.g. JSON
   (de)serialization)? Does it mock `PrismaService` rather than hitting a
   real database?
4. **Performance**: Any obvious N+1 queries, missing `Promise.all` for
   independent awaits, or unindexed filters passed to Prisma?
5. **Strict TypeScript**: No loosened `tsconfig.json` options, no unjustified
   `any`/`as` casts.

## How to provide feedback

- Be specific about what needs to change, citing the file and line.
- Explain why, referencing the specific rule from CLAUDE.md / ARCHITECTURE.md
  / .cursorrules being enforced — not just personal preference.
- Suggest the exact alternative (e.g. "inject `PrismaService` directly instead
  of adding a repository here").
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` mentally (or actually, if
  you have shell access) before approving.
