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
- Package manager: **pnpm 11** (Node ≥ 24, current Active LTS).

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

### Dependency Freshness Policy
- **Siempre la última LTS/estable, nunca a ciegas.** Node objetivo = la Active LTS
  actual (hoy Node 24; revisa el calendario de releases antes de asumirlo).
  Para cada dependencia, verifica la última versión publicada (`npm view <pkg>
  version`, o Context7) antes de bumpear — no confíes en el training data para
  decidir "cuál es la última".
- **Verifica compatibilidad de peers antes de bumpear un major.** Antes de subir
  una versión mayor, lee su changelog/migration guide (vía Context7) para
  Node mínimo requerido, breaking changes de config, y peerDependencies.
- **Nunca bumpees una dependencia directa por encima de lo que un paquete interno
  (ej. `@nestjs/platform-fastify`) fija como dependencia exacta** — eso duplica
  la instalación (dos versiones distintas del mismo paquete conviviendo) y rompe
  tipos que dependen de identidad nominal (visto con `fastify`: pínalo exacto,
  sin `^`, igual a lo que `@nestjs/platform-fastify` requiere). Corre `pnpm why
  <pkg>` para confirmar una sola versión resuelta tras cualquier bump.
- **Verifica siempre en una copia aislada, nunca en el `node_modules` real del
  usuario.** Este entorno (sandbox Linux) puede estar montado sobre el
  `node_modules` real de la máquina del usuario (con binarios nativos de su
  propio SO); correr `pnpm install` ahí lo sobreescribiría con binarios de otra
  plataforma. Copia el repo a un directorio temporal, instala y verifica
  (`typecheck`, `lint`, `test`, `build`) ahí, y solo copia de vuelta los
  archivos de texto verificados (`package.json`, `pnpm-workspace.yaml`,
  `pnpm-lock.yaml`, etc.) — nunca el `node_modules` en sí.
- **pnpm ≥11 no lee `package.json#pnpm`** — toda config de pnpm (`allowBuilds`,
  `supportedArchitectures`, etc.) vive en `pnpm-workspace.yaml`.
  `supportedArchitectures` incluye `linux`/`darwin`/`win32` × `x64`/`arm64` para
  que el lockfile resuelva los binarios nativos opcionales (`unrs-resolver`,
  motor de Prisma, etc.) de cualquier plataforma donde se corra `pnpm install`
  — evita el clásico "Cannot find native binding" al clonar en un SO distinto
  al que generó el lockfile.

### Git & Pull Request Policy
- **Autorizado a hacer `git commit` y `git push`** sobre la rama de trabajo actual — nunca directo a `main`.
- **Nunca te agregues como coautor.** El mensaje de commit no debe incluir un trailer `Co-Authored-By: Claude ...` ni menciones tipo "Generated with Claude" / "🤖". El autor es el usuario; el agente actúa en su nombre.
- **Sincroniza con `main` antes de cada push:**
  1. `git fetch origin`.
  2. Verifica que la rama local incluya los últimos commits de `origin/main` (rebase o merge si no); nunca `git push --force` salvo que el usuario lo pida explícitamente.
  3. Resuelve cualquier conflicto localmente.
  4. Vuelve a correr `pnpm typecheck` y `pnpm test` tras sincronizar, antes de pushear.
- **Abre el Pull Request tras el push** con `gh pr create` contra `main` (título + descripción del cambio, sin firmas ni menciones de IA en el cuerpo). Si `gh` no está disponible, indícale al usuario el link para abrirlo manualmente.
- `.claude/settings.json` + `.claude/hooks/git-safety.sh` son un hook de defensa en profundidad: bloquean commits con atribución a Claude/Anthropic y bloquean `git push` si la rama no está sincronizada con `origin/main`. El agente no debe depender solo del hook — debe seguir estas reglas explícitamente en cada caso.

## Agent tooling (local to this repo)

- **`.mcp.json`** — project-scoped MCP servers, versioned so every agent/session
  gets them automatically: `context7` (live third-party docs, see policy above),
  `prisma-local` (official Prisma MCP, local mode — migrate status/dev/reset,
  studio), `azure` (official Azure MCP Server, started `--read-only` by default;
  drop the flag locally if you need write access, but never commit that change).
  All three run via `npx`; no extra install step.
- **`.claude/settings.json` + `.claude/hooks/git-safety.sh`** — hooks, defense-in-depth
  for the Git & Pull Request Policy above:
  - `PreToolUse` on `Bash` blocks any commit whose message attributes authorship
    to Claude/Anthropic, and blocks `git push` if the branch is not in sync with
    `origin/main` — the agent should never rely on the hook alone and must still
    fetch/sync/resolve conflicts itself.
  - `PostToolUse` on `Edit`/`Write` runs `eslint --fix` on the touched `*.ts`
    file, keeping generated/edited code lint-clean without waiting for the
    pre-commit hook.
- **`.claude/skills/code-review/SKILL.md`** — VSA-aware code review checklist
  (architecture-boundary rules 1:1 with the "Non-negotiable architectural
  rules" above). Invoke it when reviewing a diff or PR before commit.
- **`.husky/pre-commit` + `lint-staged`** — runs `eslint --fix` on staged
  `{src,libs,test,scripts}/**/*.ts` before every commit.
- **`.github/workflows/ci.yml`** — typecheck, non-mutating lint, unit + e2e
  tests, build, on every push/PR to `main`.
- **`pnpm-workspace.yaml`** — pnpm ≥11 settings (`allowBuilds`,
  `supportedArchitectures`); see Dependency Freshness Policy above.

## Conventions

- Files per slice: `<accion>.handler.ts`, `<accion>.dto.ts`, `<accion>.spec.ts`.
- Each `libs/*` exposes a curated barrel `index.ts`; import via `@app/<lib>`, not
  deep paths. The env schema is imported via `@env/env.schema`.
- TypeScript is fully strict — do not loosen `tsconfig.json` compiler options.
- Co-locate unit tests as `*.spec.ts` inside the slice folder; e2e tests in `test/`.
- Para paginación reutiliza `PaginationQuerySchema` y `buildPaginationMeta` de `@app/common`.
