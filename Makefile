# Entry points for local work and CI (.github/workflows/ci.yml). Each target runs the
# npm script (typecheck-gateway maps to typecheck:gateway), so package.json stays
# the one definition of every step.
#
#   make check   lint, app/gateway typecheck, test, build (the CI `make check` job)
#   make e2e     Playwright; CI runs it after `make check`, which builds
#
# `npm test` runs the integration project only when TEST_DATABASE_URL is set (see
# AGENTS.md); CI sets it and starts Postgres.

.PHONY: check lint typecheck typecheck-gateway test build e2e

check: lint typecheck typecheck-gateway test build

lint typecheck test build e2e: node_modules/.package-lock.json
	npm run $@

typecheck-gateway: node_modules/.package-lock.json gateway/node_modules/.package-lock.json
	npm run typecheck:gateway

# Gateway tests run in the root Vitest project but resolve package-local dependencies.
test: gateway/node_modules/.package-lock.json

# npm writes node_modules/.package-lock.json on install, so this reinstalls only when
# package-lock.json is newer than the installed tree.
node_modules/.package-lock.json: package-lock.json
	npm ci

gateway/node_modules/.package-lock.json: gateway/package-lock.json
	npm ci --prefix gateway --ignore-scripts --no-audit --no-fund
