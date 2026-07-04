# MS Realty Migration Evidence Pack

Run the crawler from the repository root:

```bash
python3 migration/crawl_inventory.py --limit 20
python3 migration/crawl_inventory.py
```

The script writes a versioned run under `migration/artifacts/` with:

- `url-inventory.csv`
- `metadata-inventory.csv`
- `media-inventory.csv`
- `redirect-map-draft.csv`
- `crawl-summary.md`

If `CONTEXT_DEV_API_KEY` is set, sitemap discovery uses Context.dev's
`/web/scrape/sitemap` endpoint. Page metadata crawling still uses the stdlib
HTML crawler by default to avoid spending one API credit per page.

Build the local structured migration database from the crawl CSVs:

```bash
python3 migration/build_migration_db.py
```

This writes:

- `production/data/migration.sqlite`
- `production/data/migration-db-summary.json`
