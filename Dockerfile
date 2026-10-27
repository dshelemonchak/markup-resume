# syntax=docker/dockerfile:1.7
#
# One image for development, CI and (later) runtime. It contains everything the
# toolkit needs at run time: Node, pnpm, Chromium (driven over CDP, ADR-0008)
# and poppler (PDF text extraction, ADR-0009).
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
