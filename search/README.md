# MS Realty Search Prototype

This prototype turns the crawl inventory into import-ready fixtures for both
Typesense and Meilisearch. It uses real listing URLs and metadata from the
versioned crawl artifact, without another public-site crawl.

The fixtures read `locales/registry.json` so each listing carries locale,
locale prefix, indexability, and translation-status fields. The current public
website seed locales are BG, EN, DE, NL, RU, EL, and HE; admin CMS/CRM locales
are BG, RU, and EN.

## Build Fixtures

```bash
python3 search/build_search_indexes.py
```

Generated files:

- `search/data/listings.json` - shared listing corpus for UI prototypes.
- `search/data/typesense-schema.json` - Typesense collection schema.
- `search/data/typesense-listings.jsonl` - Typesense JSONL import body.
- `search/data/meilisearch-settings.json` - Meilisearch index settings.
- `search/data/meilisearch-listings.ndjson` - Meilisearch NDJSON import body.
- `search/data/search-fixture-summary.json` - corpus counts and inferred facets.

Locale fields in each listing:

- `locale` / `language` - detected source locale.
- `locale_prefix` - production URL prefix candidate.
- `locale_is_indexable` - true only for approved public locales.
- `translation_status` - `published` for approved source rows, otherwise fallback.

## Typesense Smoke

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

curl -X POST "http://localhost:7700/indexes/ms_realty_listings/documents?primaryKey=id" \
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
