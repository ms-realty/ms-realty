# MS Realty Migration Evidence Pack

Run the crawler from the repository root:

```bash
python3 migration/crawl_inventory.py --limit 20
python3 migration/crawl_inventory.py
python3 migration/compare_crawl_artifacts.py \
  --baseline migration/artifacts/20260704-211155 \
  --current migration/artifacts/<fresh-run> \
  --probe-removed
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

Before replacing the launch baseline, compare the fresh artifact against it.
The comparison writes `crawl-delta.md`, probes URLs that disappeared from the
current sitemap when requested, and refuses to describe a changed sitemap as a
safe promotion when an old URL disappeared or a current URL failed. It never
generates a homepage or search-page redirect.

Build the local structured migration database from the crawl CSVs:

```bash
python3 migration/build_migration_db.py
```

This writes:

- `production/data/migration.sqlite`
- `production/data/migration-db-summary.json`
- `production/data/migration-review-dashboard.json`

Capture source body text separately, without publishing or approving it:

```bash
python3 migration/capture_content.py
```

This creates a new `migration/content-evidence/<timestamp>/` directory with a
robots-respecting `content-inventory.jsonl`, an explicit skip report, and a
SHA-256 manifest. It never overwrites a non-empty evidence directory and does
not change the existing migration baseline or public content.
