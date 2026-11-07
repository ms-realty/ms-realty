# ADR 0009 — One tenant profile for the agency's jurisdiction, locale, currency and identity values

Status: accepted for implementation as part of the property-management pack preparation. Changes
no behaviour for the agency. ADR 0008 is reserved by the retention-policy decision record.

## Context

The system becomes the first tenant of a white-label property-management vertical. The pack seed
(`helm-ai-enterprise`, `packs/property-management/README.md`) deliberately carries no
jurisdiction, locale, currency, time zone, retention class, review interval or brand: it lists
them as _open parameters an installer must supply_. In this codebase the same values were spread
over about sixty files as literals: `"BG"`/`"GR"` enums in three Zod schemas and two forms,
`"Europe/Sofia"` in twenty places under three different constant names, `"EUR"` as a default in
twenty-five places, the brand name, logo path and phone number repeated in layouts, e-mail
subjects, calendar files, OAuth labels and validation checks.

## Decision

`src/config/tenant.ts` holds the agency's values for every open parameter the pack names that
this codebase has a value for: jurisdictions with their time zones and appointment configuration,
the agency time zone, public and staff locales with the source, right-to-left and display-locale
maps, currency codes with the default and the fixed legacy rate, availability-review defaults,
reference prefixes, legacy domains and the agency identity (name, assistant name, logo path, phone).
The existing modules (`src/domain/ids.ts`, `src/i18n/config.ts`, `src/domain/listing.ts`,
`src/domain/records.ts`, `src/features/shell/agency.ts`) re-export from it, so import paths do not
move; scattered literals import it directly.

The module is isomorphic: no environment reads and no server-only code, because the edge gateway,
client components and the database schema import it. It is not an environment variable. Several
values are pinned by Postgres enums and CHECK constraints or by hashed approved snapshots (the
operating policy stores its time zone), so a second tenant edits the file _and_ ships the matching
migration; the module header lists which values those are, and `src/config/tenant.test.ts` pins
every shipped value so a change is a deliberate act.

## Consequences

- A second agency changes one file plus migrations instead of a repository-wide search.
- Behaviour for this agency is unchanged: every value equals the literal it replaced; the only
  wording change is the appointment validation message, which no longer names a country.
- Not moved: locale-specific copy in `src/features/*/copy.ts` and message files (brand surface);
  `src/features/inventory/**`, `src/server/inventory/**` beyond one enum and the staff inventory
  routes (Codex's active area; their `"BG"`/`"GR"` options and `"EUR"` defaults follow later);
  the `"bg"` display fallbacks in about forty UI sites (they should import `sourceLocale`);
  deployment identities (hosts, worker and bucket names, cookie prefixes, database roles), which are
  operations identity checks and stay with the deploy gates; the `place.countryCode === "BG"`
  language attribute in the content form, because deriving it for GR would change rendered output.
- The lifecycle dataset of the pack was not generated from this code and the pack did not ask for an
  export; `docs/branch-ledger.md` records how the code's transition tables compare with it.
