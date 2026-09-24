# MS Realty agent context

Product authority: `docs/spec.md`. Plan, architecture decisions and slices: `docs/plan.md`.
Use spec IDs (P/C/O screens, F flows, A acceptance scenarios) in route files, test names and PRs.

## Launch boundary

- The launch authority is `docs/plan.md` §7. Do not call the system production-ready, and do
  not deploy, while any gate there is not green and recorded. Merges to `main` never deploy.
- Real launch evidence comes from live services and operator inputs, not local fixtures.
- Preserve crawl parity for `makler-realty.com` and `makler-realty.ru`. Legacy URL mappings
  must rest on recorded evidence (`data/legacy/url-decisions.json`); never invent homepage or
  search-page redirect assumptions.
- Bulgarian (`bg`) is the default source locale. A public translation is indexable only after a
  human approves it.

## Hermes / AI rules

- Hermes may draft translations, buyer/seller replies, QA notes and broker task summaries.
- Hermes must not publish pages, mark translations indexable, send customer messages, or approve
  legal/tax/process claims. It never receives publish, send, index or approve capabilities.
- Public assistance answers only from approved listing and content records.
- Preserve property facts exactly: price, area, bedrooms, location, listing reference and
  source URL.
- Sandanski is an inland destination: never frame it as a sea, beach or coast destination.

## Secrets and personal data

- Keep secrets out of committed files. Use environment variables (see `.env.example`) and
  redacted reports only.
- No real customer personal data in code, fixtures, tests or docs. The only public phone
  number is the brand line `+359879696870`.

## Development

```sh
npm ci                 # install (Node >= 22.13; CI uses Node 24)
npm run dev            # local dev server
npm run lint           # Biome; `npm run format` applies fixes
npm run typecheck      # next typegen + tsc --noEmit
npm test               # Vitest: unit (+ integration when TEST_DATABASE_URL is set)
npm run build          # Next production build
npm run e2e            # Playwright (builds, then starts on E2E_PORT, default 3100)
npm run check          # everything CI runs
```

Concurrent builds or e2e runs need their own output dir and port:
`NEXT_DIST_DIR=.next-mywork E2E_PORT=3150 npm run e2e`.

Integration tests (`*.int.test.ts`) run against a disposable Postgres, never a shared one:

```sh
docker run -d --rm --name ms-realty-test-pg -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:17-alpine
TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55432/postgres npm run test:integration
docker stop ms-realty-test-pg
```

Pass `TEST_DATABASE_URL` / `DATABASE_URL` per command; never export them globally.
