# MS Realty

The MS Realty real-estate agency platform: a public site, a client space and an agency
workspace in one Next.js application backed by PostgreSQL.

This is the rebuild described in [`docs/plan.md`](docs/plan.md), which implements the
target-state specification in [`docs/spec.md`](docs/spec.md). The previous application is
preserved at git tag `legacy-app-final`; the facts it held that are imported once live in
[`data/legacy/`](data/legacy/README.md).

## Local setup

Requires Node.js 22.13 or newer (CI uses Node 24) and Docker for the database.

```sh
npm ci
npx playwright install chromium   # once, for end-to-end tests
cp .env.example .env.local        # then fill in local values
npm run dev                       # http://localhost:3000/bg
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm run lint` / `format` | Biome check / apply fixes |
| `npm run typecheck` | Generate route types and run `tsc --noEmit` |
| `npm test` | All Vitest projects (`test:unit`, `test:integration`) |
| `npm run e2e` | Playwright smoke and journeys (Chromium desktop + mobile) |
| `npm run db:generate` / `db:migrate` | Generate SQL migrations / apply them to `DATABASE_URL` |
| `npm run import:legacy` | One-time import of `data/legacy/` |
| `npm run check` | Lint, typecheck, tests, build and e2e — the required CI check |

Integration tests need a disposable Postgres; without `TEST_DATABASE_URL` they are skipped
locally (CI always runs them):

```sh
docker run -d --rm --name ms-realty-test-pg -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:17-alpine
TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55432/postgres npm run test:integration
docker stop ms-realty-test-pg
```

Every environment variable is documented in [`.env.example`](.env.example). Agent and
contributor rules are in [`AGENTS.md`](AGENTS.md).
