# MS Realty

Rebuild of **makler-realty.com** + **makler-realty.ru** (family real-estate agency, Sandanski,
Bulgaria) into a multilingual, SEO-safe, phone-first property-search and broker-operations platform.

**The one hard constraint:** the two domains' 13-year search equity is the asset. Preserve every
indexed URL first; add product on top. Nothing launches until a crawl proves URL/metadata/content
parity against the old sites.

## Facts

- **Domains:** `makler-realty.com` (multilingual main) + `makler-realty.ru` (active Russian, first-class).
- **Crawl universe:** 457 URLs (278 `.com` + 179 `.ru`) · 165 listings · 11,859 media rows.
- **Locales:** public BG, EN, DE, NL, RU, EL (Greek), HE (Hebrew RTL); admin CMS/CRM BG, RU, EN.
- **Target stack:** Next.js + Payload CMS + PostgreSQL + Typesense/Meilisearch + MapLibre GL JS +
  Photo Sphere Viewer + the **Hermes Agent** AI layer (self-hosted Nous Research open-weight Hermes
  models + function-calling format; draft-only, human-approved). `production/` holds the executable
  contracts, and `app/` now exposes them through build-checked Next App Router handlers.

## Where the truth lives

- **[`SOURCE_OF_TRUTH.md`](SOURCE_OF_TRUTH.md)** — the single canonical doc: strategy, product,
  stack, data model, migration plan, phases, and current status.
- Code-local docs describe each subsystem: [`production/`](production/README.md),
  [`migration/`](migration/README.md), [`search/`](search/README.md), [`locales/`](locales/README.md),
  [`makler-realty-design-system/`](makler-realty-design-system/project/readme.md), `prototypes/`, `qa/`.

Running code + `production/data/*` + crawl artifacts are authoritative; if a doc disagrees, the code wins.

## Run

```bash
npm run check                                # lint + tests + full validate pipeline
MS_REALTY_ADMIN_TOKEN=replace-me MS_REALTY_ADMIN_ACTOR=operations_lead MS_REALTY_ADMIN_ROLES=admin npm start
```

The server refuses to start without `MS_REALTY_ADMIN_TOKEN` or the per-operator
`MS_REALTY_ADMIN_CREDENTIALS_JSON` registry — there is no implicit admin credential.

Before any production cutover, mirror the legacy media (every listing image is
still served by the old WordPress origins):

```bash
npm run media:mirror
```

Requires Node ≥ 22 and Python 3.
