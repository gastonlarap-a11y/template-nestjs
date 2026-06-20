# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Multi-stage, production-grade image.
#
# 2026 win: Prisma 7's client is pure TypeScript (no Rust query-engine binary),
# so there are no platform-specific engine files to copy — smaller images and
# faster cold starts on Azure Container Apps / App Service.
# ---------------------------------------------------------------------------

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- Builder: install all deps, generate client, compile ------------------
FROM base AS builder
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
# Generate the Prisma client if the schema is present (skip for no-Prisma setups).
RUN if [ -f prisma/schema.prisma ]; then pnpm prisma:generate; fi
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
