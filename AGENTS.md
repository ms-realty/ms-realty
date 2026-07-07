# MS Realty Agent Context

## Production Boundary

- Treat `production/data/launch-readiness.json` and `production/data/launch-input-checklist.md` as the current launch authority.
- Do not call the system production-ready while any launch gate is blocked.
- Preserve crawl parity for `makler-realty.com` and `makler-realty.ru`; never invent homepage/search-page redirect assumptions.
- Keep BG as the default source locale. Public translations must be human-approved before indexing.

## Hermes Agent Rules

- Hermes may draft translations, buyer/seller replies, QA notes, and broker task summaries.
- Hermes must not publish pages, mark translations indexable, send customer messages, or approve legal/tax/process claims.
- Use only approved CMS/listing sources for public chat answers.
- Preserve property facts exactly: price, area, bedrooms, location, listing reference, and source URL.
- Never frame Sandanski as a sea destination.

## Launch Evidence

- Real launch evidence must come from live services and operator inputs, not local smoke fixtures.
- Required external proof includes Search Console, Yandex Webmaster, backlinks, live Typesense/Meilisearch reports, live Hermes worker report, Payload runtime report, and complete human listing review CSV.
- Keep secrets out of committed files. Use env vars and redacted reports only.
