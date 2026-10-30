Drizzle schema (`schema/`), migrations runner (`migrate.ts`) and the one-time legacy import (`import/`).
The records follow `docs/architecture.md` §4.1.

- `schema/` — one file per area (`identity`, `parties`, `inventory`, `publication`, `work`,
  `coordination`, `approvals`, `records`, `migration`, `geography`, `settings`); enums come from
  `src/domain` constants so state names cannot drift. Why facts are rows of an immutable fact
  revision is explained at the top of `schema/inventory.ts`.
- `client.ts` — the server-only, lazily created connection pool (`getDb()`).
- `migrate.ts` — `runMigrations(url)`; also the `npm run db:migrate` entry point.
- `test-utils.ts` — `createTestDatabase()` gives each integration test file its own migrated database.

SQL migration history lives in `db/migrations`, starting with `0000_extensions` (custom: pg_trgm, unaccent,
btree_gist, `immutable_unaccent`), `0001_schema` (generated), `0002_constraints` (custom:
immutability triggers and the appointment-resource exclusion constraint). The committed
journal records the subsequent migrations; source history does not establish which migrations
have run in a deployed environment. For schema changes, edit `schema/`, then
`npm run db:generate`. Rules Drizzle cannot express are custom migrations created with
`npx drizzle-kit generate --custom --name <name>`.
