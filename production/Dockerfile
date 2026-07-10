# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM dependencies AS build

ENV NODE_ENV=production
COPY . .
RUN npm run design:build && npm run next:build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app /app

USER nextjs
EXPOSE 3000

CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
