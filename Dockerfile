# syntax=docker/dockerfile:1
# Official multi-architecture Node 24 LTS index, verified 2026-09-27. One immutable application
# image runs web, worker and pre-deploy migrator with distinct commands and credentials.
FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
# Gateway's scoped production dependencies are needed by the repository-wide Next type check.
# This build-only install does not place Wrangler or gateway tooling in the runtime image.
RUN npm ci --prefix gateway --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm run build && node scripts/build-runtime.mjs

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runtime
WORKDIR /app
ARG BUILD_SHA=local-uncommitted
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 MIGRATIONS_FOLDER=/app/db/migrations BUILD_SHA=$BUILD_SHA
LABEL org.opencontainers.image.source="https://github.com/ms-realty/ms-realty" org.opencontainers.image.revision=$BUILD_SHA
COPY --from=build --chown=node:node /app/.next/standalone ./
# Worker and migrator use the same pinned production dependency tree. No tsx/dev toolchain.
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist-runtime ./dist-runtime
COPY --from=build --chown=node:node /app/db/migrations ./db/migrations
USER node
EXPOSE 3000
CMD ["node", "server.js"]
