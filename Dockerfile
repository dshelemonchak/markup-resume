# syntax=docker/dockerfile:1.7
#
# One base for development, CI and production. It contains everything the app
# needs at run time: Node, pnpm, Chromium (driven over CDP, ADR-0008) and
# poppler (PDF text extraction, ADR-0009). Production is two images (ADR-0029):
# `runtime`, the API and MCP server, and `web`, Caddy serving the built UI and
# proxying to the app.
#
# Chromium comes from Debian rather than Google Chrome: Google ships Chrome for
# Linux on amd64 only, and this image must also run natively on arm64 (Apple Silicon).

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-trixie-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      poppler-utils \
      fonts-dejavu-core \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV CHROME_PATH=/usr/bin/chromium \
    PNPM_HOME=/home/node/.local/share/pnpm \
    PATH=/home/node/.local/share/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /workspace
RUN chown node:node /workspace
USER node
# Pre-fetch the pnpm version pinned in package.json so containers start offline.
RUN corepack install --global pnpm@12.15.0

# Development: the repository is bind-mounted at /workspace (see compose.yaml).
FROM base AS dev
CMD ["sleep", "infinity"]

# CI: install from the lockfile and run every check inside the image.
FROM base AS ci
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node packages/app/package.json packages/app/
COPY --chown=node:node packages/styles/package.json packages/styles/
COPY --chown=node:node packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile
COPY --chown=node:node . .
RUN pnpm check

# Production build: every dependency from the lockfile, then the UI.
FROM base AS build
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node packages/app/package.json packages/app/
COPY --chown=node:node packages/styles/package.json packages/styles/
COPY --chown=node:node packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile
COPY --chown=node:node . .
# The release version the UI shows (deploy workflow); empty builds show "dev".
ARG APP_VERSION=
RUN pnpm --filter @markup-resume/web build --define "APP_VERSION='${APP_VERSION}'"

# Production app: the API and MCP server, with only the dependencies of the app
# and the style library. Node runs the TypeScript sources directly, as in dev.
FROM base AS runtime
ENV NODE_ENV=production
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node packages/app/package.json packages/app/
COPY --chown=node:node packages/styles/package.json packages/styles/
COPY --chown=node:node packages/web/package.json packages/web/
# The store and pnpm's metadata cache would stay in the image otherwise; node_modules keeps hard links to the
# store's files.
RUN pnpm install --frozen-lockfile --prod --filter @markup-resume/app... \
 && rm -rf .pnpm-store /home/node/.cache/pnpm
COPY --chown=node:node packages/styles packages/styles
COPY --chown=node:node packages/app/src packages/app/src
WORKDIR /workspace/packages/app
EXPOSE 3000
CMD ["node", "src/main.ts"]

# Production web: Caddy terminates TLS, serves the built UI and proxies the
# app's paths to it (deploy/Caddyfile).
FROM caddy:2.10-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/packages/web/dist/web/browser /srv
