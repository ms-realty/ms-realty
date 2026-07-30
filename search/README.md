# MS Realty Search Prototype

This prototype turns the crawl inventory into import-ready fixtures for both
Typesense and Meilisearch. It uses real listing URLs and metadata from the
versioned crawl artifact, without another public-site crawl.

The fixtures read `locales/registry.json` so each listing carries locale,
locale prefix, indexability, and translation-status fields. The current public
website seed locales are BG, EN, DE, NL, RU, EL, and HE; admin CMS/CRM locales
are BG, RU, and EN.

Search text also carries a deterministic Latin variant of Cyrillic content.
The public runtime applies the same normalization to both listings and queries,
so buyers can find Cyrillic listings when their keyboard is set to Latin (and
Latin location names when their keyboard is set to Cyrillic). This is search
normalization only; it does not create or approve public translations.

## Build Fixtures

```bash
python3 search/build_search_indexes.py
python3 search/validate_search_imports.py
npm run search:sync:smoke
npm run search:query:smoke
```

Set `MS_REALTY_LOCALE_REGISTRY_PATH` and `MS_REALTY_LISTING_EDIT_LEDGER_PATH`
when building fixtures from mounted production locale/listing-review state.

## Approved Projection and Benchmark Baseline

The production rebuild input is a joined listing/approval JSON file. It is
fail-closed: a row is emitted only when its explicit approval says
`publication_state=published`, `translation_human_approved=true`, and
`locale_indexable=true`; unverified facts and internal coordinates are never
written to the projection.

Production search also requires one explicit runtime choice:
`MS_REALTY_SEARCH_ENGINE=typesense` or `MS_REALTY_SEARCH_ENGINE=meilisearch`.
It does not fall through to the other provider or to seed data when the chosen
engine is unavailable.

```bash
npm run search:projection -- --input /secure/joined-listings.json --out /tmp/ms-realty-approved-search
```

The no-Docker benchmark harness has a separate tested-image baseline of
Typesense `30.2` and Meilisearch `v1.11.3`. It starts no services and does not
change `production/docker-compose.local-production.yml`.

```bash
npm run search:benchmark -- \
  --typesense-url "$TYPESENSE_URL" --typesense-key "$TYPESENSE_API_KEY" \
  --meili-url "$MEILI_URL" --meili-key "$MEILI_API_KEY" \
  --out /tmp/ms-realty-search-benchmark.json
```

If you launch temporary containers for this benchmark, stop and remove only
those explicitly named benchmark containers after preserving the report.

Generated files:

- `search/data/listings.json` - 165 source listings used by CMS/import prototypes.
- `search/data/index-listings.json` - 167 locale-scoped search documents, including approved Greek and Hebrew translations for `MS-CRAWL-0001`.
- `search/data/typesense-schema.json` - Typesense collection schema.
- `search/data/typesense-listings.jsonl` - Typesense JSONL import body.
- `search/data/meilisearch-settings.json` - Meilisearch index settings.
- `search/data/meilisearch-listings.ndjson` - Meilisearch NDJSON import body.
- `search/data/search-fixture-summary.json` - corpus counts and inferred facets.
- `production/data/search-engine-sync-smoke.json` - local proof that the same 167 documents are sent to both engine APIs.
- `production/data/search-engine-query-smoke.json` - local proof that both engine query APIs return the reviewed BG listing document.

`validate_search_imports.py` checks that the Typesense JSONL and Meilisearch
NDJSON match `index-listings.json`, have unique IDs, fit the Typesense schema,
and exclude non-indexable locale documents.

Locale fields in each search index document:

- `locale` / `language` - document locale.
- `locale_prefix` - production URL prefix candidate.
- `locale_path` - locale-prefixed production listing path.
- `locale_is_indexable` - true only for approved public locales.
- `translation_status` - `published` for source rows or `approved` for approved translation rows.
- `translation_indexable` - true only when the locale document can be public/indexed.
- `search_document_type` - `source` or `approved_translation`.

## Typesense Smoke

For configured engines, use the worker path instead of hand-written curl:

```bash
TYPESENSE_URL=http://localhost:8108 \
TYPESENSE_API_KEY=dev-ms-realty \
MEILI_URL=http://localhost:7700 \
MEILI_API_KEY=dev-ms-realty \
npm run search:sync
npm run search:query
```

```bash
docker run --rm -p 8108:8108 \
  -v "$PWD/search/data:/data" \
  typesense/typesense:28.0 \
  --data-dir /data/typesense-db \
  --api-key=dev-ms-realty \
  --enable-cors

curl -X POST "http://localhost:8108/collections" \
  -H "X-TYPESENSE-API-KEY: dev-ms-realty" \
  -H "Content-Type: application/json" \
  --data-binary @search/data/typesense-schema.json

curl -X POST \
  "http://localhost:8108/collections/ms_realty_listings/documents/import?action=upsert" \
  -H "X-TYPESENSE-API-KEY: dev-ms-realty" \
  --data-binary @search/data/typesense-listings.jsonl

curl "http://localhost:8108/collections/ms_realty_listings/documents/search?q=Sandanski&query_by=title,description,search_text&filter_by=domain:=makler-realty.com" \
  -H "X-TYPESENSE-API-KEY: dev-ms-realty"
```

## Meilisearch Smoke

```bash
docker run --rm -p 7700:7700 \
  -e MEILI_MASTER_KEY=dev-ms-realty \
  getmeili/meilisearch:v1.15

curl -X PATCH "http://localhost:7700/indexes/ms_realty_listings/settings" \
  -H "Authorization: Bearer dev-ms-realty" \
  -H "Content-Type: application/json" \
  --data-binary @search/data/meilisearch-settings.json

curl -X POST "http://localhost:7700/indexes/ms_realty_listings/documents?primaryKey=meili_id" \
  -H "Authorization: Bearer dev-ms-realty" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @search/data/meilisearch-listings.ndjson

curl -X POST "http://localhost:7700/indexes/ms_realty_listings/search" \
  -H "Authorization: Bearer dev-ms-realty" \
  -H "Content-Type: application/json" \
  --data '{"q":"Sandanski","filter":"domain = makler-realty.com"}'
```

## Limits

The current crawl metadata does not expose reliable structured prices or area,
so those fields stay nullable. They should be filled from the future source CMS
or enriched crawl extraction before production search ranking depends on them.
