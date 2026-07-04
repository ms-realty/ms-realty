# MS Realty Production Foundation

This folder contains the first executable production contracts for the future
Next.js/Payload application. It is deliberately dependency-free for this slice:
the app framework can be added once these rules are stable.

What it proves now:

- Dynamic approved locale registry.
- Locale-prefixed public listing routes.
- Hreflang generation only for approved/indexable translations.
- Hermes Agent draft-only translation guardrails.
- Translation stale-state rules.
- CRM lead language routing into BG/RU/EN admin queues.
- Search fixtures carry locale/indexability metadata.
- Normalized migration records from the crawl CSVs with launch-gate checks.
- Legacy route map for reviewed listing redirects and unmapped review queues.
- Localized sitemap fixture gated by approved translation records.
- Generated `sitemap.xml` and `robots.txt` from approved localized sitemap entries.
- Canonical CMS seed records composed from crawl, route, translation, and media evidence.
- Public route fixtures for locale-prefixed listing/search/fallback routes.
- Admin CRM/CMS shell language availability in BG, RU, and EN.
- Website route coverage for Greek and Hebrew, including Hebrew RTL metadata.
- Admin workflow fixtures for Hermes CMS translation review and CRM lead reply drafts.
- Runtime smoke fixture for listing route, search route, fallback route, and lead intake.
- HTTP JSON adapter smoke fixture for listing, search, fallback, and lead endpoints.
- Live Node HTTP server smoke fixture on an ephemeral local port.
- Append-only lead ledger for persisted CRM intake smoke rows.
- Gated admin lead inbox JSON endpoint with BG/RU/EN interface locale support.
- Broker-approved reply outbox for reviewed CRM replies; Hermes drafts are never auto-sent.

Run:

```bash
npm run check
```

Generated production data:

- `production/data/migration-records.json`
- `production/data/legacy-route-map.json`
- `production/data/localized-sitemap.json`
- `production/data/sitemap.xml`
- `production/data/robots.txt`
- `production/data/cms-seed.json`
- `production/data/public-fixtures.json`
- `production/data/admin-fixtures.json`
- `production/data/runtime-smoke.json`
- `production/data/http-smoke.json`
- `production/data/node-server-smoke.json`
- `production/data/lead-ledger.jsonl`
- `production/data/reply-outbox.jsonl`

The next production slice can consume these contracts from a Next.js App Router
public app and Payload CMS collections without re-deciding URL, locale, AI, or
lead-language policy.
