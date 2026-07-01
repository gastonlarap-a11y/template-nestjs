# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Multi-stage, production-grade image.
#
# 2026 win: Prisma 7's client is pure TypeScript (no Rust query-engine binary),
# so there are no platform-specific engine files to copy — smaller images and
# faster cold starts on Azure Container Apps / App Service.
# ---------------------------------------------------------------------------

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- Builder: install all deps, generate client, compile ------------------
FROM base AS builder
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
# `prisma generate` only reads the schema (no DB connection opened), but
# `prisma.config.ts` still requires `DATABASE_URL` to be resolvable — a
# placeholder is enough here; override with `--build-arg DATABASE_URL=...`
# if a real one is ever needed at build time.
ARG DATABASE_URL="sqlserver://localhost:1433;database=build;user=sa;password=x;trustServerCertificate=true"
ENV DATABASE_URL=${DATABASE_URL}
RUN pnpm prisma:generate
RUN pnpm build
# Strip dev dependencies in place (keeps the generated client).
RUN pnpm prune --prod

# ---- Runner: minimal, non-root --------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
# `node` is an unprivileged user that already exists in the base image.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json
# Prisma schema/migrations are handy for running migrations from the container.
COPY --from=builder --chown=node:node /app/prisma ./prisma

USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
# `dist/src/main` because the build includes both `src` and `libs` trees.
CMD ["node", "dist/src/main.js"]
