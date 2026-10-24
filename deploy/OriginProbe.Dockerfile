FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
ARG SOURCE_COMMIT
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT
WORKDIR /probe
COPY scripts/legacy-origin-probe.mjs scripts/origin-probe-server.mjs ./
ENV PROBE_SOURCE_COMMIT=$SOURCE_COMMIT
USER node
EXPOSE 3000
CMD ["node", "origin-probe-server.mjs"]
