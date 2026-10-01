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
# Cloudflare Containers run linux/amd64. Retained official HTTPS package and extracted binary
# are both pinned; this does not claim a signed current repository entry for this old version.
ADD --checksum=sha256:3be76adc4185d36a0bfb4c2dd8663292f0ed363797f2180333b513b43c81d419 https://pkg.cloudflare.com/cloudflared/pool/main/c/cloudflared/cloudflared_2026.9.1_amd64.deb /tmp/cloudflared.deb
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && test "$(dpkg-deb -f /tmp/cloudflared.deb Version)" = "2026.9.1" \
    && test "$(dpkg-deb -f /tmp/cloudflared.deb Architecture)" = "amd64" \
    && dpkg-deb -x /tmp/cloudflared.deb /tmp/cloudflared \
    && echo '03f1f25d1cc93b9ad6c60569d44060bc4f17ed97075760ed8cfca4b12dcd68cc  /tmp/cloudflared/usr/bin/cloudflared' | sha256sum -c - \
    && install -o root -g root -m 0755 /tmp/cloudflared/usr/bin/cloudflared /usr/local/bin/cloudflared \
    && rm -rf /tmp/cloudflared /tmp/cloudflared.deb /var/lib/apt/lists/*
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
# Identity is created once inside this exact image, never taken from runtime bindings. The
# root-owned file is unreadable for writes by the node process, and is outside copied source.
COPY --from=build /app/scripts/runtime-entry.mjs /app/runtime-entry.mjs
RUN node --input-type=module -e 'import {writeFileSync} from "node:fs"; import {randomUUID} from "node:crypto"; writeFileSync("/app/runtime-image.json", JSON.stringify({schemaVersion:1,sourceCommit:process.env.BUILD_SHA,buildNonce:randomUUID()}), {mode:0o444});' \
    && chown root:root /app /app/runtime-entry.mjs && chmod 755 /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
