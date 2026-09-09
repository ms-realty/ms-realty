"""Recover the legacy lot id (WordPress `wtf_pid`) for every migrated listing.

The old site kept the agency's lot number in a per-post custom field, and the
new catalog identifies listings by its own reference (MS-CRAWL-nnnn), so the
number the team still quotes on the phone is nowhere in the new database. This
reads the cPanel mysqldump captured from SuperHosting, pairs each legacy
listing with the new reference through the approved redirect map, and writes one
artifact that carries both identifiers plus the legacy URL.

Usage:
    python3 migration/extract_legacy_lot_ids.py \
        --dump-dir ~/Downloads/MS-Realty-SuperHosting-Recovery-2026-08-31/cpmove/mysql \
        --out production/data/legacy-lot-id-map.json
"""

from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import urllib.parse

# The dumps are one mysqldump per WordPress site: `newc` served makler-realty.com
# and `newru` served makler-realty.ru. Same schema, same lot numbers.
DATABASES = {
    "maklerre_newc": "makler-realty.com",
    "maklerre_newru": "makler-realty.ru",
}
LOT_ID_META_KEY = "wtf_pid"
LISTING_POST_TYPE = "listings"
# Column order of ms_posts in the dump, only the fields this script reads.
POSTS_COLUMNS = {"id": 0, "title": 5, "status": 7, "name": 11, "type": 20}


def split_values(text: str) -> list[str]:
    """Split one mysqldump tuple body into raw column values."""
    values, current, quoted, escaped = [], "", False, False
    for char in text:
        if quoted:
            if escaped:
                current += char
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == "'":
                quoted = False
            else:
                current += char
            continue
        if char == "'":
            quoted = True
            continue
        if char == ",":
            values.append(current.strip())
            current = ""
            continue
        current += char
    values.append(current.strip())
    return values


def split_tuples(text: str) -> list[list[str]]:
    """Split the VALUES body of an extended INSERT into tuples."""
    tuples, current, depth, quoted, escaped = [], "", 0, False, False
    for char in text:
        if quoted:
            current += char
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == "'":
                quoted = False
            continue
        if char == "'":
            quoted = True
            current += char
            continue
        if char == "(":
            depth += 1
            if depth == 1:
                current = ""
                continue
        if char == ")":
            depth -= 1
            if depth == 0:
                tuples.append(split_values(current))
                current = ""
                continue
        if depth:
            current += char
    return tuples


def table_rows(path: pathlib.Path, table: str):
    """Yield every row of one table. Extended INSERTs wrap across lines."""
    header = re.compile(rf"INSERT INTO `{re.escape(table)}` \([^)]*\) VALUES ")
    buffer, inside = "", False
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not inside:
                match = header.match(line)
                if not match:
                    continue
                inside, buffer = True, line[match.end() :]
            else:
                buffer += line
            if buffer.rstrip().endswith(";"):
                yield from split_tuples(buffer)
                inside, buffer = False, ""


def slug_key(value: str) -> str:
    """Comparable slug. WordPress appends __trashed when a post is binned."""
    decoded = urllib.parse.unquote(value or "").lower().strip("/")
    return re.sub(r"__trashed(-\d+)?$", "", decoded)


def legacy_listings(dump_dir: pathlib.Path) -> dict[tuple[str, str], dict]:
    listings: dict[tuple[str, str], dict] = {}
    for database, domain in DATABASES.items():
        path = dump_dir / f"{database}.sql"
        if not path.exists():
            raise SystemExit(f"missing dump: {path}")
        lot_ids = {
            row[1]: row[3]
            for row in table_rows(path, "ms_postmeta")
            if len(row) >= 4 and row[2] == LOT_ID_META_KEY
        }
        for row in table_rows(path, "ms_posts"):
            if len(row) <= POSTS_COLUMNS["type"]:
                continue
            if row[POSTS_COLUMNS["type"]] != LISTING_POST_TYPE:
                continue
            post_id = row[POSTS_COLUMNS["id"]]
            if post_id not in lot_ids:
                continue
            listings[(domain, slug_key(row[POSTS_COLUMNS["name"]]))] = {
                "legacy_lot_id": lot_ids[post_id],
                "legacy_domain": domain,
                "legacy_post_id": post_id,
                "legacy_post_status": row[POSTS_COLUMNS["status"]],
                "legacy_title": row[POSTS_COLUMNS["title"]],
            }
    return listings


# WordPress truncates post_name to 200 bytes, and a percent-encoded Cyrillic
# slug can be cut mid-character, so a handful of crawled URLs are one character
# longer than the stored slug. A prefix match recovers those, but only when it
# is unambiguous, and the record says the pairing was fuzzy so a human can check.
PREFIX_MATCH_MINIMUM = 24


def prefix_match(listings: dict, domain: str, slug: str) -> dict | None:
    if len(slug) < PREFIX_MATCH_MINIMUM:
        return None
    candidates = [
        listing
        for (listing_domain, listing_slug), listing in listings.items()
        if listing_domain == domain
        and (listing_slug.startswith(slug[:-1]) or slug.startswith(listing_slug))
    ]
    return candidates[0] if len(candidates) == 1 else None


def build(dump_dir: pathlib.Path, redirects_path: pathlib.Path) -> dict:
    listings = legacy_listings(dump_dir)
    redirects = json.loads(redirects_path.read_text(encoding="utf-8"))["redirects"]

    records, unresolved = [], []
    for redirect in redirects:
        segments = [s for s in urllib.parse.urlparse(redirect["old_url"]).path.split("/") if s]
        slug = slug_key(segments[-1] if segments else "")
        reference = redirect["target_path"].rsplit("/", 1)[-1]
        listing = listings.get((redirect["source_domain"], slug))
        matched_on = "slug"
        if not listing:
            listing = prefix_match(listings, redirect["source_domain"], slug)
            matched_on = "slug_prefix"
        if not listing:
            unresolved.append({"new_reference": reference, "legacy_url": redirect["old_url"]})
            continue
        records.append(
            {
                "new_reference": reference,
                "new_path": redirect["target_path"],
                "legacy_lot_id": listing["legacy_lot_id"],
                "legacy_url": redirect["old_url"],
                "legacy_domain": listing["legacy_domain"],
                "legacy_post_id": listing["legacy_post_id"],
                "legacy_post_status": listing["legacy_post_status"],
                "legacy_title": listing["legacy_title"],
                "matched_on": matched_on,
            }
        )

    by_lot = collections.defaultdict(list)
    for record in records:
        by_lot[record["legacy_lot_id"]].append(record)
    # One lot listed in both languages became two new records; the lot id is the
    # only thing that reunites them. A lot id used twice on the SAME domain is a
    # legacy data error and needs a human decision, so both are reported apart.
    cross_domain = sorted(
        lot for lot, rows in by_lot.items() if len({r["legacy_domain"] for r in rows}) > 1
    )
    reused = sorted(
        lot
        for lot, rows in by_lot.items()
        if max(collections.Counter(r["legacy_domain"] for r in rows).values()) > 1
    )
    return {
        "artifact_id": "legacy-lot-id-map",
        "summary": {
            "redirects": len(redirects),
            "resolved": len(records),
            "unresolved": len(unresolved),
            "matched_on_slug_prefix": sum(1 for r in records if r["matched_on"] == "slug_prefix"),
            "distinct_lot_ids": len(by_lot),
            "lot_ids_on_both_domains": len(cross_domain),
            "lot_ids_reused_within_one_domain": len(reused),
        },
        "review": {
            "reused_lot_ids": reused,
            "unresolved": unresolved,
            "fuzzy_matches": [r["new_reference"] for r in records if r["matched_on"] == "slug_prefix"],
        },
        "records": sorted(records, key=lambda r: r["new_reference"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dump-dir", required=True, type=pathlib.Path)
    parser.add_argument("--redirects", type=pathlib.Path, default=pathlib.Path("production/data/deployable-redirects.json"))
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("production/data/legacy-lot-id-map.json"))
    args = parser.parse_args()

    artifact = build(args.dump_dir.expanduser(), args.redirects)
    args.out.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(artifact["summary"], indent=2))


if __name__ == "__main__":
    main()
