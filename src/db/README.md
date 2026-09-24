Drizzle schema (`schema/`), migrations runner (`migrate.ts`), seed and the one-time legacy import (plan AD2).

- `schema/` — one file per area; enums come from `src/domain` constants so state names cannot drift.
  The facts-as-rows decision is explained at the top of `schema/properties.ts`.
- `client.ts` — the server-only, lazily created connection pool (`getDb()`).
- `migrate.ts` — `runMigrations(url)`; also the `npm run db:migrate` entry point.
- `test-utils.ts` — `createTestDatabase()` gives each integration test file its own migrated database.

SQL migrations live in `db/migrations`. Schema changes: edit `schema/`, then `npm run db:generate`.
Rules Drizzle cannot express (extensions, immutability triggers, exclusion constraints) are custom
migrations created with `npx drizzle-kit generate --custom --name <name>`.
