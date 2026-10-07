# MS Realty

The MS Realty real-estate agency platform: a public site, a client space and an agency
workspace in one Next.js application backed by PostgreSQL.

This is the rebuild described in [`docs/plan.md`](docs/plan.md), implementing the
[architecture](docs/architecture.md), [ADR 0002](docs/adr/0002-implementation-deviations.md)
and [UX specification](docs/ux-spec.md). Current recovery work and outstanding acceptance
are recorded in [the delivery ledger](docs/delivery/2026-09-27-recovery.md). The previous application is
preserved at git tag `legacy-app-final`; the facts it held that are imported once live in
[`data/legacy/`](data/legacy/README.md).

## Local setup

Requires Node.js 22.13 or newer (CI uses Node 24) and Docker for the database.

```sh
npm ci
npx playwright install chromium webkit  # once, for end-to-end tests
cp .env.example .env.local        # then fill in local values
docker run -d --name ms-realty-local-pg -e POSTGRES_PASSWORD=pg -p 127.0.0.1:5432:5432 postgres:18-alpine
DATABASE_URL=postgres://postgres:pg@127.0.0.1:5432/postgres npm run db:migrate
npm run dev                       # http://localhost:3000/bg
```

One app serves three hosts (architecture §11.1): public `http://localhost:3000/bg`, client
`http://my.localhost:3000/bg/access` and staff `http://app.localhost:3000/bg/today`. Browsers
resolve `*.localhost` to loopback; any other host (`127.0.0.1` too) answers only `/api/health`.
Staff routes require an active session and two passkeys. To enroll the first local manager,
run the offline operator command with a new absolute private output path:

```sh
DATABASE_URL=postgres://postgres:pg@127.0.0.1:5432/postgres npm run auth:bootstrap -- \
  --email operator@example.test --name 'Local operator' --output /tmp/ms-realty-first-invitation.json
```

Open the invitation URL from that file on the staff host. It expires after one hour; opening
it does not consume it. The command sends no email and never prints the bearer link to logs.
Existing staff requires the invitation-management flow or explicit audited `--break-glass`
recovery. For nonlocal use, provide the real host settings and secrets per command as well.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm run lint` / `format` | Biome check / apply fixes |
| `npm run typecheck` | Generate route types and run `tsc --noEmit` |
| `npm test` | All Vitest projects (`test:unit`, `test:integration`) |
| `npm run e2e` | Fresh isolated database, production build, Chromium desktop/mobile and mobile WebKit journeys |
| `npm run storybook` / `storybook:build` | Interactive component catalog / static build |
| `npm run test:visual:docker` | Screenshot checks in the pinned Linux browser image |
| `npm run tokens:check` | Verify generated CSS and Figma token files match their source |
| `npm run openapi:generate` / `release:schemas` | Regenerate transport contracts and evidence schemas |
| `npm run release:evaluate -- --help` | Validate exact-candidate evidence; missing evidence blocks release |
| `npm run db:generate` / `db:migrate` | Generate SQL migrations / apply them to `DATABASE_URL` |
| `npm run import:legacy` | One-time import of `data/legacy/` |
| `make check` | Lint, typecheck, tests and build (runs `npm ci` first when the lockfile changed) |
| `make e2e` | `npm run e2e`; CI runs it after `make check` inside `ci / gate` |
| `npm run check` | `make check`'s steps, then e2e |

Integration tests need a disposable Postgres; without `TEST_DATABASE_URL` they are skipped
locally (CI always runs them):

```sh
docker run -d --rm --name ms-realty-test-pg -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:18-alpine
TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55432/postgres npm run test:integration
TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55432/postgres npm run e2e
docker stop ms-realty-test-pg
```

Browser tests also require `TEST_DATABASE_URL`. They create, migrate and remove a database
named `msr_e2e_<run-id>`; they do not reuse a development database or an existing server.
Use `NEXT_DIST_DIR=.next-other E2E_PORT=3150` for a concurrent browser run. Update visual
baselines with `npm run test:visual:docker:update`, inspect the images, then run the check.
Local tests and synthetic records are development evidence; they do not pass live release gates.

Every environment variable is documented in [`.env.example`](.env.example). Agent and
contributor rules are in [`AGENTS.md`](AGENTS.md).
