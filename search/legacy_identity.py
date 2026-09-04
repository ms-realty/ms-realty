"""Lot number identity for the migrated catalog.

The agency's lot number is the listing id (MS-00662, with the legacy sub lot
suffix kept as in MS-00567-1). This module assigns every crawl era record its
lot number, its id and, for the cross domain twins, the record it retires into,
purely from the two identity inputs so that the Python minter and the Node
seed builder (production/lib/listing-identity.mjs) agree by construction.

Usage:
    python3 search/legacy_identity.py --print-map
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MAP_PATH = ROOT / "production" / "data" / "legacy-lot-id-map.json"
DEFAULT_OVERRIDES_PATH = ROOT / "production" / "data" / "legacy-lot-id-overrides.json"

LISTING_ID_PATTERN = re.compile(r"^MS-\d{5}(?:-\d{1,3})?$")
MIGRATION_ID_PATTERN = re.compile(r"^MS-(?:CRAWL-)?\d{4}$")
LEGACY_LOT_ID_PATTERN = re.compile(r"^0*(\d{1,7})(?:-(\d{1,3}))?$")
NEW_LOT_NUMBER_FLOOR = 1000
SURVIVING_DOMAIN = "makler-realty.com"
RETIRED_DOMAIN = "makler-realty.ru"
OVERRIDE_ACTIONS = {"assign_legacy", "keep", "assign_new", "reassign_new"}


class ListingIdentityError(ValueError):
    """Raised when a listing cannot be given exactly one lot number."""


def format_listing_id(lot_number: int, lot_suffix: str | None = None) -> str:
    if not isinstance(lot_number, int) or isinstance(lot_number, bool) or not 1 <= lot_number <= 99999:
        raise ListingIdentityError(f"Listing lot number must be an integer between 1 and 99999, got {lot_number!r}")
    suffix = str(lot_suffix or "").strip()
    if suffix and not re.fullmatch(r"\d{1,3}", suffix):
        raise ListingIdentityError(f"Listing lot suffix must be one to three digits, got {lot_suffix!r}")
    return f"MS-{lot_number:05d}" + (f"-{suffix}" if suffix else "")


def parse_legacy_lot_id(value: object) -> tuple[int, str | None] | None:
    match = LEGACY_LOT_ID_PATTERN.match(str(value or "").strip())
    if not match or int(match.group(1)) < 1:
        return None
    return int(match.group(1)), match.group(2)


def _text(value: object) -> str:
    return str(value or "").strip()


def _domain_of(url: str) -> str:
    host = urlparse(url).hostname or ""
    if not host:
        raise ListingIdentityError(f"Legacy identity URL is not absolute: {url}")
    return host.removeprefix("www.")


def load_identity_inputs(map_path: Path = DEFAULT_MAP_PATH, overrides_path: Path = DEFAULT_OVERRIDES_PATH) -> dict[str, object]:
    return {
        "map": json.loads(map_path.read_text(encoding="utf-8")),
        "overrides": json.loads(overrides_path.read_text(encoding="utf-8")),
    }


def _identity_rows(lot_map: dict[str, object], overrides: dict[str, object]) -> dict[str, dict[str, object]]:
    rows: dict[str, dict[str, object]] = {}
    for record in lot_map.get("records", []):
        migration_id = _text(record.get("new_reference"))
        if not migration_id:
            raise ListingIdentityError("Legacy lot id map record has no new_reference")
        if migration_id in rows:
            raise ListingIdentityError(f"Legacy lot id map repeats {migration_id}")
        rows[migration_id] = {
            "migration_id": migration_id,
            "legacy_url": _text(record.get("legacy_url")),
            "legacy_domain": _text(record.get("legacy_domain")) or _domain_of(_text(record.get("legacy_url"))),
            "legacy_lot_id": _text(record.get("legacy_lot_id")) or None,
            "legacy_post_id": _text(record.get("legacy_post_id")) or None,
            "override": None,
            "lot_number": None,
            "lot_suffix": None,
        }
    for unresolved in (lot_map.get("review") or {}).get("unresolved", []):
        migration_id = _text(unresolved.get("new_reference"))
        if migration_id in rows:
            continue
        rows[migration_id] = {
            "migration_id": migration_id,
            "legacy_url": _text(unresolved.get("legacy_url")),
            "legacy_domain": _domain_of(_text(unresolved.get("legacy_url"))),
            "legacy_lot_id": None,
            "legacy_post_id": None,
            "override": None,
            "lot_number": None,
            "lot_suffix": None,
        }
    for migration_id, override in (overrides or {}).items():
        row = rows.get(migration_id)
        if row is None:
            raise ListingIdentityError(f"Legacy lot id override names an unknown record: {migration_id}")
        if not isinstance(override, dict) or override.get("action") not in OVERRIDE_ACTIONS:
            raise ListingIdentityError(f"Legacy lot id override {migration_id} has an unknown action")
        row["override"] = override
    return rows


def assign_listing_identities(lot_map: dict[str, object], overrides: dict[str, object]) -> list[dict[str, object]]:
    """Return one identity row per crawl era record, sorted by migration id."""
    rows = _identity_rows(lot_map, overrides)
    ordered = sorted(rows.values(), key=lambda row: row["migration_id"])

    # Fresh numbers go out in crawl id order from the floor; a pair of
    # reassignments that shared one legacy number on the two domains is one
    # lot and draws one number (MS-CRAWL-0026 and MS-CRAWL-0125).
    next_number = NEW_LOT_NUMBER_FLOOR
    for row in ordered:
        action = (row["override"] or {}).get("action")
        if action not in {"assign_new", "reassign_new"} or row["lot_number"]:
            continue
        row["lot_number"] = next_number
        row["lot_suffix"] = None
        if action == "reassign_new" and row["legacy_lot_id"]:
            for partner in ordered:
                if (
                    partner is not row
                    and not partner["lot_number"]
                    and (partner["override"] or {}).get("action") == "reassign_new"
                    and partner["legacy_lot_id"] == row["legacy_lot_id"]
                    and partner["legacy_domain"] != row["legacy_domain"]
                ):
                    partner["lot_number"] = next_number
                    partner["lot_suffix"] = None
        next_number += 1

    for row in ordered:
        action = (row["override"] or {}).get("action")
        if action in {"assign_new", "reassign_new"}:
            if action == "assign_new":
                row["legacy_lot_id"] = None
            continue
        if action == "assign_legacy":
            number = row["override"].get("lot_number")
            if not isinstance(number, int) or isinstance(number, bool) or number < 1:
                raise ListingIdentityError(f"Legacy lot id override {row['migration_id']} needs a lot number")
            row["lot_number"] = number
            row["lot_suffix"] = None
            row["legacy_lot_id"] = row["legacy_lot_id"] or str(number)
            continue
        parsed = parse_legacy_lot_id(row["legacy_lot_id"])
        if parsed is None:
            raise ListingIdentityError(f"Legacy lot id is missing or malformed for {row['migration_id']}: {row['legacy_lot_id']}")
        if action == "keep" and row["override"].get("lot_number") != parsed[0]:
            raise ListingIdentityError(
                f"Legacy lot id override {row['migration_id']} keeps {row['override'].get('lot_number')} but the map says {row['legacy_lot_id']}"
            )
        row["lot_number"], row["lot_suffix"] = parsed

    by_lot: dict[str, list[dict[str, object]]] = {}
    for row in ordered:
        by_lot.setdefault(format_listing_id(row["lot_number"], row["lot_suffix"]), []).append(row)
    for lot_id, group in by_lot.items():
        if len(group) == 1:
            row = group[0]
            row["id"] = lot_id
            row["merged_into"] = None
            row["legacy_urls"] = [{"domain": row["legacy_domain"], "url": row["legacy_url"]}]
            continue
        survivor = next((row for row in group if row["legacy_domain"] == SURVIVING_DOMAIN), None)
        retired = next((row for row in group if row["legacy_domain"] == RETIRED_DOMAIN), None)
        if len(group) != 2 or survivor is None or retired is None:
            claimants = ", ".join(row["migration_id"] for row in group)
            raise ListingIdentityError(f"Lot {lot_id} is claimed by {claimants}; one public id must equal one lot")
        survivor["id"] = lot_id
        survivor["merged_into"] = None
        survivor["legacy_urls"] = [
            {"domain": survivor["legacy_domain"], "url": survivor["legacy_url"]},
            {"domain": retired["legacy_domain"], "url": retired["legacy_url"]},
        ]
        # The retired twin keeps its crawl era id: it is not public, so it
        # consumes no lot number and the id stays resolvable for the old URL.
        retired["id"] = retired["migration_id"]
        retired["merged_into"] = lot_id
        retired["legacy_urls"] = [{"domain": retired["legacy_domain"], "url": retired["legacy_url"]}]

    return [
        {
            "migration_id": row["migration_id"],
            "id": row["id"],
            "lot_number": row["lot_number"],
            "lot_suffix": row["lot_suffix"],
            "legacy_lot_id": row["legacy_lot_id"],
            "legacy_post_id": row["legacy_post_id"],
            "legacy_domain": row["legacy_domain"],
            "legacy_url": row["legacy_url"],
            "legacy_urls": row["legacy_urls"],
            "merged_into": row["merged_into"],
            "retired": bool(row["merged_into"]),
        }
        for row in ordered
    ]


def assert_listing_identity_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    problems: list[str] = []
    ids: dict[str, int] = {}
    migration_ids: dict[str, int] = {}
    for row in rows:
        listing_id = _text(row.get("id"))
        migration_id = _text(row.get("migration_id"))
        if not listing_id:
            problems.append(f"{migration_id or 'unknown'}: missing id")
        elif row.get("merged_into"):
            if listing_id != migration_id or not MIGRATION_ID_PATTERN.match(listing_id):
                problems.append(f"{listing_id}: malformed id")
        elif not LISTING_ID_PATTERN.match(listing_id):
            problems.append(f"{listing_id}: malformed id")
        lot_number = row.get("lot_number")
        if not isinstance(lot_number, int) or isinstance(lot_number, bool) or lot_number < 1:
            problems.append(f"{listing_id or migration_id}: missing lot number")
        if not migration_id or not MIGRATION_ID_PATTERN.match(migration_id):
            problems.append(f"{listing_id or migration_id}: malformed migration id")
        if listing_id:
            ids[listing_id] = ids.get(listing_id, 0) + 1
        if migration_id:
            migration_ids[migration_id] = migration_ids.get(migration_id, 0) + 1
    problems.extend(f"{listing_id}: duplicate id" for listing_id, count in ids.items() if count > 1)
    problems.extend(f"{listing_id}: duplicate migration id" for listing_id, count in migration_ids.items() if count > 1)
    public_ids = {_text(row.get("id")) for row in rows if not row.get("merged_into")}
    for row in rows:
        if row.get("merged_into") and _text(row.get("merged_into")) not in public_ids:
            problems.append(f"{row.get('id')}: merged into unknown listing {row.get('merged_into')}")
    if problems:
        raise ListingIdentityError("Listing identity is invalid: " + "; ".join(problems))
    return rows


class ListingIdentity:
    """Lookup of the assigned identity by crawl URL, with the crawl era reference cross checked."""

    def __init__(self, rows: list[dict[str, object]]):
        self.rows = assert_listing_identity_rows(rows)
        self.by_url: dict[str, dict[str, object]] = {}
        for row in self.rows:
            url = str(row["legacy_url"])
            if url in self.by_url:
                raise ListingIdentityError(f"Legacy identity URL is claimed twice: {url}")
            self.by_url[url] = row

    @classmethod
    def load(cls, map_path: Path = DEFAULT_MAP_PATH, overrides_path: Path = DEFAULT_OVERRIDES_PATH) -> "ListingIdentity":
        inputs = load_identity_inputs(map_path, overrides_path)
        return cls(assign_listing_identities(inputs["map"], inputs["overrides"]))

    @classmethod
    def from_inputs(cls, lot_map: dict[str, object], overrides: dict[str, object]) -> "ListingIdentity":
        return cls(assign_listing_identities(lot_map, overrides))

    def resolve(self, url: str, crawl_reference: str) -> dict[str, object]:
        row = self.by_url.get(url)
        if row is None:
            raise ListingIdentityError(f"No lot number is assigned for {url} ({crawl_reference}); record a decision in legacy-lot-id-overrides.json")
        if row["migration_id"] != crawl_reference:
            raise ListingIdentityError(f"Crawl reference drift for {url}: identity says {row['migration_id']}, crawl says {crawl_reference}")
        return row


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map", type=Path, default=DEFAULT_MAP_PATH)
    parser.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES_PATH)
    parser.add_argument("--print-map", action="store_true", help="print the crawl id to identity map as JSON")
    args = parser.parse_args()
    identity = ListingIdentity.load(args.map, args.overrides)
    if args.print_map:
        print(json.dumps({row["migration_id"]: row for row in identity.rows}, ensure_ascii=False, indent=2))
    else:
        public = sum(1 for row in identity.rows if not row["retired"])
        print(f"{len(identity.rows)} listings: {public} public ids, {len(identity.rows) - public} retired twins")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
