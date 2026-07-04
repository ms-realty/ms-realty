#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACT_DIR = ROOT / "migration" / "artifacts" / "20260704-211155"
DEFAULT_DB_PATH = ROOT / "production" / "data" / "migration.sqlite"
DEFAULT_SUMMARY_PATH = ROOT / "production" / "data" / "migration-db-summary.json"

TABLES = {
    "url_inventory": "url-inventory.csv",
    "metadata_inventory": "metadata-inventory.csv",
    "media_inventory": "media-inventory.csv",
    "redirect_map_draft": "redirect-map-draft.csv",
}


def raise_csv_limit() -> None:
    limit = sys.maxsize
    while True:
        try:
            csv.field_size_limit(limit)
            return
        except OverflowError:
            limit //= 10


def quote_identifier(name: str) -> str:
    if not name.replace("_", "").isalnum():
        raise ValueError(f"Unsafe identifier: {name}")
    return f'"{name}"'


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    raise_csv_limit()
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError(f"Missing CSV header: {path}")
        return reader.fieldnames, list(reader)


def import_table(conn: sqlite3.Connection, table: str, path: Path) -> int:
    fields, rows = read_csv(path)
    table_name = quote_identifier(table)
    columns = ", ".join(f"{quote_identifier(field)} TEXT" for field in fields)
    placeholders = ", ".join("?" for _ in fields)

    conn.execute(f"DROP TABLE IF EXISTS {table_name}")
    conn.execute(f"CREATE TABLE {table_name} ({columns})")
    conn.executemany(
        f"INSERT INTO {table_name} ({', '.join(quote_identifier(field) for field in fields)}) VALUES ({placeholders})",
        ([row.get(field, "") for field in fields] for row in rows),
    )
    return len(rows)


def is_root(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.path in {"", "/"}


def grouped_counts(conn: sqlite3.Connection, table: str, field: str) -> dict[str, int]:
    query = f"SELECT {quote_identifier(field)}, COUNT(*) FROM {quote_identifier(table)} GROUP BY {quote_identifier(field)}"
    return {str(key): count for key, count in conn.execute(query)}


def scalar(conn: sqlite3.Connection, query: str) -> int:
    return int(conn.execute(query).fetchone()[0])


def create_views(conn: sqlite3.Connection) -> None:
    conn.execute("DROP VIEW IF EXISTS migration_url_review")
    conn.execute(
        """
        CREATE VIEW migration_url_review AS
        SELECT
          u.source_domain,
          u.sitemap_source,
          u.url,
          u.url_type,
          m.status,
          m.final_url,
          m.title,
          m.meta_description,
          m.canonical,
          m.robots_meta,
          m.hreflang,
          m.h1,
          m.word_count,
          m.image_count,
          m.schema_present,
          r.new_url,
          r.status AS redirect_status,
          r.reason AS redirect_reason
        FROM url_inventory u
        LEFT JOIN metadata_inventory m
          ON m.source_domain = u.source_domain
         AND m.sitemap_source = u.sitemap_source
         AND m.url = u.url
        LEFT JOIN redirect_map_draft r
          ON r.old_url = u.url
        """
    )
    conn.execute("DROP VIEW IF EXISTS media_by_page")
    conn.execute(
        """
        CREATE VIEW media_by_page AS
        SELECT source_domain, page_url, page_type, COUNT(*) AS media_count
        FROM media_inventory
        GROUP BY source_domain, page_url, page_type
        """
    )


def build_summary(conn: sqlite3.Connection, artifact_dir: Path, table_counts: dict[str, int], db_path: Path) -> dict:
    redirect_rows = conn.execute("SELECT old_url, new_url FROM redirect_map_draft").fetchall()
    homepage_redirect_targets = sum(1 for old_url, new_url in redirect_rows if not is_root(old_url) and is_root(new_url))
    summary = {
        "artifact_id": artifact_dir.name,
        "db_path": str(db_path),
        "tables": table_counts,
        "url_domains": grouped_counts(conn, "url_inventory", "source_domain"),
        "url_types": grouped_counts(conn, "url_inventory", "url_type"),
        "status_codes": grouped_counts(conn, "metadata_inventory", "status"),
        "joined_url_metadata_rows": scalar(
            conn,
            """
            SELECT COUNT(*)
            FROM url_inventory u
            JOIN metadata_inventory m
              ON m.source_domain = u.source_domain
             AND m.sitemap_source = u.sitemap_source
             AND m.url = u.url
            """,
        ),
        "joined_url_redirect_rows": scalar(
            conn,
            """
            SELECT COUNT(*)
            FROM url_inventory u
            JOIN redirect_map_draft r ON r.old_url = u.url
            """,
        ),
        "media_pages": scalar(conn, "SELECT COUNT(*) FROM media_by_page"),
        "homepage_redirect_targets": homepage_redirect_targets,
    }
    return summary


def assert_summary(summary: dict) -> None:
    tables = summary["tables"]
    if tables.get("url_inventory") != 457:
        raise SystemExit("migration DB must import 457 URL rows")
    if tables.get("metadata_inventory") != 457:
        raise SystemExit("migration DB must import 457 metadata rows")
    if tables.get("redirect_map_draft") != 457:
        raise SystemExit("migration DB must import 457 redirect rows")
    if tables.get("media_inventory") != 11859:
        raise SystemExit("migration DB must import 11859 media rows")
    if summary["url_domains"].get("makler-realty.com") != 278:
        raise SystemExit("migration DB must preserve 278 .com rows")
    if summary["url_domains"].get("makler-realty.ru") != 179:
        raise SystemExit("migration DB must preserve 179 .ru rows")
    if summary["status_codes"].get("200") != 457:
        raise SystemExit("migration DB baseline must be all HTTP 200")
    if summary["joined_url_metadata_rows"] != 457 or summary["joined_url_redirect_rows"] != 457:
        raise SystemExit("migration DB joins must cover every URL row")
    if summary["homepage_redirect_targets"] != 0:
        raise SystemExit("migration DB must not contain bulk homepage redirects")


def build_database(artifact_dir: Path, db_path: Path, summary_path: Path) -> dict:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    with sqlite3.connect(db_path) as conn:
        table_counts = {
            table: import_table(conn, table, artifact_dir / filename)
            for table, filename in TABLES.items()
        }
        conn.execute("CREATE INDEX idx_url_inventory_url ON url_inventory(url)")
        conn.execute("CREATE INDEX idx_metadata_inventory_url ON metadata_inventory(url)")
        conn.execute("CREATE INDEX idx_redirect_map_old_url ON redirect_map_draft(old_url)")
        conn.execute("CREATE INDEX idx_media_inventory_page_url ON media_inventory(page_url)")
        create_views(conn)
        summary = build_summary(conn, artifact_dir, table_counts, db_path)
        assert_summary(summary)

    summary_path.write_text(f"{json.dumps(summary, indent=2, ensure_ascii=False)}\n", encoding="utf-8")
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the local migration SQLite evidence database.")
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT_DIR)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY_PATH)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    summary = build_database(args.artifact_dir, args.db, args.summary)
    print(f"Wrote migration DB to {args.db}")
    print(f"Wrote migration DB summary to {args.summary}")
    print(f"Tables: {json.dumps(summary['tables'], sort_keys=True)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
