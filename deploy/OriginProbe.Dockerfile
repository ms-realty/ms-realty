FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
ARG SOURCE_COMMIT
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT
WORKDIR /probe
COPY scripts/legacy-origin-probe.mjs scripts/origin-probe-server.mjs ./
ENV PROBE_SOURCE_COMMIT=$SOURCE_COMMIT
USER node
EXPOSE 3000
CMD ["node", "origin-probe-server.mjs"]
