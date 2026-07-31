# Cloudflare Container image for the MS Realty Next runtime.
#
# The container's disk is ephemeral: every time the instance wakes it gets a
# fresh copy of THIS image. Legacy media is deliberately not baked in: the
# Worker serves /wp-content/uploads/* from R2 before it wakes this container.
# That preserves the legacy URLs without re-pushing a 453 MB mirror on deploy.
#
# Anything that must survive *and change* (leads, consents, audit) cannot live
# on this disk. Public deployment requires a deliberately wired durable store.

FROM node:22-bookworm-slim AS dependencies
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM dependencies AS build
ARG MS_REALTY_BUILD_MARKER=unversioned
ENV NODE_ENV=production
COPY . .
# Keep the revision inside the image rather than forwarding it from the
# Worker: an old Container must not be able to claim a new Worker revision.
RUN printf '%s\n' "$MS_REALTY_BUILD_MARKER" > .ms-realty-build-marker
# payload.config.js fails closed on these in production. The build only needs
# them to import the config; nothing connects to a database here. They are
# dummies, but scoping them to this one RUN keeps them out of image layers
# and silences Docker's SecretsUsedInArgOrEnv warning.
RUN PAYLOAD_SECRET=build-only-secret-not-used-at-runtime-0123456789 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build_only \
    npm run next:build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app /app

USER nextjs
EXPOSE 8080

CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "8080"]
