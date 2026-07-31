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
DEFAULT_DASHBOARD_PATH = ROOT / "production" / "data" / "migration-review-dashboard.json"

TABLES = {
    "url_inventory": "url-inventory.csv",
    "metadata_inventory": "metadata-inventory.csv",
    "media_inventory": "media-inventory.csv",
    "redirect_map_draft": "redirect-map-draft.csv",
}


def repo_relative_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


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


def rows(conn: sqlite3.Connection, query: str) -> list[dict]:
    cursor = conn.execute(query)
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


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
        "db_path": repo_relative_path(db_path),
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


def build_dashboard(conn: sqlite3.Connection, artifact_dir: Path) -> dict:
    gap_columns = """
      SUM(CASE WHEN COALESCE(title, '') = '' THEN 1 ELSE 0 END) AS missing_title,
      SUM(CASE WHEN COALESCE(meta_description, '') = '' THEN 1 ELSE 0 END) AS missing_description,
      SUM(CASE WHEN COALESCE(h1, '') = '' THEN 1 ELSE 0 END) AS missing_h1,
      SUM(CASE WHEN schema_present NOT IN ('yes', 'true') THEN 1 ELSE 0 END) AS missing_schema,
      SUM(CASE WHEN CAST(COALESCE(image_count, '0') AS INTEGER) = 0 THEN 1 ELSE 0 END) AS zero_images
    """
    return {
        "artifact_id": artifact_dir.name,
        "metadata_gaps": rows(conn, f"SELECT {gap_columns} FROM metadata_inventory")[0],
        "metadata_gaps_by_type": rows(
            conn,
            f"""
            SELECT url_type, COUNT(*) AS urls, {gap_columns}
            FROM migration_url_review
            GROUP BY url_type
            ORDER BY urls DESC
            """,
        ),
        "metadata_gaps_by_domain": rows(
            conn,
            f"""
            SELECT source_domain, COUNT(*) AS urls, {gap_columns}
            FROM migration_url_review
            GROUP BY source_domain
            ORDER BY urls DESC
            """,
        ),
        "media_reconciliation": {
            "media_rows": scalar(conn, "SELECT COUNT(*) FROM media_inventory"),
            "pages_with_media": scalar(conn, "SELECT COUNT(*) FROM media_by_page"),
            "missing_alt_rows": scalar(conn, "SELECT COUNT(*) FROM media_inventory WHERE COALESCE(alt, '') = ''"),
            "by_domain": grouped_counts(conn, "media_inventory", "source_domain"),
            "by_page_type": grouped_counts(conn, "media_inventory", "page_type"),
            "top_pages": rows(
                conn,
                """
                SELECT source_domain, page_url, page_type, media_count
                FROM media_by_page
                ORDER BY media_count DESC, page_url
                LIMIT 10
                """,
            ),
        },
        "redirect_review": {
            "rows": scalar(conn, "SELECT COUNT(*) FROM redirect_map_draft"),
            "preserve_same_url_candidates": scalar(conn, "SELECT COUNT(*) FROM redirect_map_draft WHERE status = '200_candidate'"),
            "homepage_redirect_targets": scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM redirect_map_draft
                WHERE old_url NOT IN ('https://makler-realty.com', 'https://makler-realty.com/', 'https://makler-realty.ru', 'https://makler-realty.ru/')
                  AND new_url IN ('https://makler-realty.com', 'https://makler-realty.com/', 'https://makler-realty.ru', 'https://makler-realty.ru/')
                """,
            ),
        },
        "review_examples": rows(
            conn,
            """
            SELECT source_domain, url_type, url, title, meta_description, h1, schema_present, image_count
            FROM migration_url_review
            WHERE COALESCE(meta_description, '') = ''
               OR COALESCE(h1, '') = ''
               OR schema_present NOT IN ('yes', 'true')
               OR CAST(COALESCE(image_count, '0') AS INTEGER) = 0
            ORDER BY source_domain, url_type, url
            LIMIT 20
            """,
        ),
    }


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


def assert_dashboard(dashboard: dict) -> None:
    media = dashboard["media_reconciliation"]
    redirect = dashboard["redirect_review"]
    if dashboard["metadata_gaps"]["missing_schema"] <= 0:
        raise SystemExit("migration dashboard must expose metadata gaps")
    if media["media_rows"] != 11859 or media["pages_with_media"] != 457:
        raise SystemExit("migration dashboard must reconcile media rows to crawled pages")
    if redirect["rows"] != 457 or redirect["homepage_redirect_targets"] != 0:
        raise SystemExit("migration dashboard must preserve redirect review safety")


def build_database(artifact_dir: Path, db_path: Path, summary_path: Path, dashboard_path: Path) -> dict:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    dashboard_path.parent.mkdir(parents=True, exist_ok=True)
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
        dashboard = build_dashboard(conn, artifact_dir)
        assert_dashboard(dashboard)

    summary_path.write_text(f"{json.dumps(summary, indent=2, ensure_ascii=False)}\n", encoding="utf-8")
    dashboard_path.write_text(f"{json.dumps(dashboard, indent=2, ensure_ascii=False)}\n", encoding="utf-8")
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the local migration SQLite evidence database.")
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT_DIR)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY_PATH)
    parser.add_argument("--dashboard", type=Path, default=DEFAULT_DASHBOARD_PATH)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    summary = build_database(args.artifact_dir, args.db, args.summary, args.dashboard)
    print(f"Wrote migration DB to {args.db}")
    print(f"Wrote migration DB summary to {args.summary}")
    print(f"Wrote migration review dashboard to {args.dashboard}")
    print(f"Tables: {json.dumps(summary['tables'], sort_keys=True)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
