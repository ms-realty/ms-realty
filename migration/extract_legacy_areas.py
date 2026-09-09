"""Recover the legacy area figures (`wtf_area`, `wtf_total_area`) for every migrated listing.

Every listing in `production/data/cms-seed.json` carries a null area: the crawl
that seeded the catalog never captured the number, and the new property model
stores area in family-specific fields rather than in one generic column. The old
WordPress postmeta still holds the figures, so this reads the cPanel mysqldump,
pairs each catalog record with its legacy post through
`production/data/legacy-lot-id-map.json`, normalises the stored strings, and
writes one artifact a human can review.

This script proposes. It never writes to the catalog and never touches the
listing edit ledger: `production/scripts/apply-legacy-area-facts.mjs` turns
approved rows into ordinary listing edits.

The legacy field says *how much* area, never *which* area. In the new model an
apartment can carry `living_area_sqm`, `built_area_sqm` or `usable_area_sqm`,
and the legacy copy uses them interchangeably: MS-CRAWL-0004 states
"застроената площ ... е 99" while MS-CRAWL-0007 states a built area of 50,65 and
an "обща площ" of 59,21, and `wtf_area` holds 99 and 59,21 respectively. Only
`plot` and `agricultural_land` have a single area field, so only those get a
target field here. Every other family is reported with the candidate fields and
the sentence around the number so a reviewer can pick one with the evidence in
front of them.

Usage:
    python3 migration/extract_legacy_areas.py \
        --dump-dir ~/Downloads/MS-Realty-SuperHosting-Recovery-2026-08-31/cpmove-maklerre/mysql \
        --out production/data/legacy-area-map.json
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import pathlib
import re

from extract_legacy_lot_ids import DATABASES, LISTING_POST_TYPE, POSTS_COLUMNS, table_rows

AREA_META_KEYS = ("wtf_area", "wtf_total_area")
DOMAIN_DATABASES = {domain: database for database, domain in DATABASES.items()}

# Mirrors PRIMARY_AREA_FIELDS in production/lib/listing-facts.mjs. Kept here only
# to build the proposal; the applier revalidates every field against the real
# registry and refuses one that is not applicable to the family.
FAMILY_AREA_FIELDS = {
    "apartment": ("living_area_sqm", "built_area_sqm", "usable_area_sqm"),
    "house": ("built_area_sqm", "living_area_sqm"),
    "plot": ("land_area_sqm",),
    "agricultural_land": ("land_area_sqm",),
    "commercial": ("usable_area_sqm", "gross_floor_area_sqm"),
    "hotel": ("gross_floor_area_sqm", "built_area_sqm"),
}

# A plot has one area field, so the legacy number can only mean that field. Every
# other family needs a human to say which of its fields the number describes.
FORCED_AREA_FIELD = {family: fields[0] for family, fields in FAMILY_AREA_FIELDS.items() if len(fields) == 1}

# Multipliers for the units the legacy copy uses. Matched on equality after
# spaces and dots are stripped, so an unrecognised unit is reported rather than
# silently read as square metres.
AREA_UNITS = (
    ("хектара", 10_000.0),
    ("хектар", 10_000.0),
    ("декара", 1_000.0),
    ("декар", 1_000.0),
    ("дка", 1_000.0),
    ("гка", 10_000.0),
    ("га", 10_000.0),
    ("ha", 10_000.0),
    ("кв.м", 1.0),
    ("кв.метра", 1.0),
    ("квм", 1.0),
    ("м2", 1.0),
    ("м²", 1.0),
    ("m2", 1.0),
    ("m²", 1.0),
    ("sqm", 1.0),
)
# Below a square metre the string was almost certainly a thousands group read as
# a decimal; above a thousand hectares it was never an area.
PLAUSIBLE_SQM = (1.0, 10_000_000.0)
# The unit can carry a digit ("м2"), so the number is matched greedily up to its
# last digit and whatever follows is the unit.
NUMBER = r"\d[\d\s.,]*\d|\d"
RANGE_PATTERN = re.compile(rf"^(?P<low>{NUMBER})\s*[-–—]\s*(?P<high>{NUMBER})\s*(?P<unit>.*)$")
VALUE_PATTERN = re.compile(rf"^(?P<number>{NUMBER})\s*(?P<unit>.*)$")


def normalize_number(raw: str) -> float | None:
    """Read one legacy number. Mirrors areaNumber() in listing-fact-review.mjs."""
    text = re.sub(r"\s+", "", raw or "")
    if not text:
        return None
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        parts = text.split(",")
        text = text.replace(",", "") if len(parts[-1]) == 3 and len(parts[0]) > 1 else text.replace(",", ".")
    elif "." in text:
        parts = text.split(".")
        if len(parts[-1]) == 3 and len(parts[0]) > 1:
            text = text.replace(".", "")
    try:
        return float(text)
    except ValueError:
        return None


def unit_scale(raw: str) -> float | None:
    unit = re.sub(r"[\s.]+", "", (raw or "").strip().lower())
    if not unit:
        return 1.0
    for token, scale in AREA_UNITS:
        if unit == re.sub(r"[\s.]+", "", token):
            return scale
    return None


def parse_area(raw: str | None) -> dict:
    """Normalise one stored area string to square metres.

    Returns the value plus the reason it could not be used, so an unusable
    figure still reaches the review section carrying its original text.
    """
    text = (raw or "").strip()
    if not text:
        return {"raw": None, "sqm": None, "reason": None}
    range_match = RANGE_PATTERN.match(text)
    if range_match:
        scale = unit_scale(range_match.group("unit")) or 1.0
        low = normalize_number(range_match.group("low"))
        high = normalize_number(range_match.group("high"))
        return {
            "raw": text,
            "sqm": None,
            "reason": "range",
            "range_sqm": [low * scale, high * scale] if low and high else None,
        }
    value_match = VALUE_PATTERN.match(text)
    if not value_match:
        return {"raw": text, "sqm": None, "reason": "unreadable"}
    scale = unit_scale(value_match.group("unit"))
    number = normalize_number(value_match.group("number"))
    if scale is None:
        return {"raw": text, "sqm": None, "reason": "unknown_unit"}
    if number is None:
        return {"raw": text, "sqm": None, "reason": "unreadable"}
    value = round(number * scale, 2)
    if not PLAUSIBLE_SQM[0] <= value <= PLAUSIBLE_SQM[1]:
        return {"raw": text, "sqm": None, "reason": "implausible"}
    return {"raw": text, "sqm": value, "reason": None}


def legacy_areas(dump_dir: pathlib.Path) -> dict[tuple[str, str], dict[str, str]]:
    """Every listing post's area postmeta, keyed by (domain, post id)."""
    areas: dict[tuple[str, str], dict[str, str]] = {}
    for database, domain in DATABASES.items():
        path = dump_dir / f"{database}.sql"
        if not path.exists():
            raise SystemExit(f"missing dump: {path}")
        meta: dict[str, dict[str, str]] = collections.defaultdict(dict)
        for row in table_rows(path, "ms_postmeta"):
            if len(row) >= 4 and row[2] in AREA_META_KEYS:
                meta[row[1]][row[2]] = row[3]
        listing_posts = {
            row[POSTS_COLUMNS["id"]]
            for row in table_rows(path, "ms_posts")
            if len(row) > POSTS_COLUMNS["type"] and row[POSTS_COLUMNS["type"]] == LISTING_POST_TYPE
        }
        for post_id, values in meta.items():
            if post_id in listing_posts:
                areas[(domain, post_id)] = values
    return areas


def description_phrase(description: str, value: float | None) -> str | None:
    """The words the legacy copy puts in front of this number.

    The reviewer needs to see whether the source called it "застроена площ" or
    "обща площ" before choosing a field, and the description is the only place
    that says so.
    """
    if not description or value is None:
        return None
    written = f"{value:g}"
    for spelling in {written, written.replace(".", ",")}:
        match = re.search(rf"(?<![\d,.]){re.escape(spelling)}(?![\d,.])", description)
        if not match:
            continue
        start = max(0, match.start() - 110)
        return re.sub(r"\s+", " ", description[start : match.end()]).strip()
    return None


# `production/data/legacy-lot-id-overrides.json` records the human decisions that
# correct the map. A record the reviewers moved to a new agency number no longer
# owns the lot id the map paired it with, so grouping by that id would report a
# conflict between two unrelated properties.
LOT_ID_RELEASED_ACTIONS = frozenset({"assign_new", "reassign_new"})


def resolved_lot_id(lot: dict | None, override: dict) -> str | None:
    action = override.get("action")
    if action in LOT_ID_RELEASED_ACTIONS:
        return None
    if override.get("lot_number") is not None:
        return str(override["lot_number"])
    return lot["legacy_lot_id"] if lot else None


def build(
    dump_dir: pathlib.Path,
    lot_map_path: pathlib.Path,
    seed_path: pathlib.Path,
    live_audit_path: pathlib.Path,
    lot_overrides_path: pathlib.Path,
) -> dict:
    areas = legacy_areas(dump_dir)
    lot_map = json.loads(lot_map_path.read_text(encoding="utf-8"))
    lot_overrides = json.loads(lot_overrides_path.read_text(encoding="utf-8")) if lot_overrides_path.exists() else {}
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    live_rows = json.loads(live_audit_path.read_text(encoding="utf-8"))["listings"] if live_audit_path.exists() else []

    listings = {record["id"]: record for record in seed["records"] if record.get("collection") == "listings"}
    properties = {property_record["id"]: property_record for property_record in seed.get("properties", [])}
    live_area = {row["id"]: row.get("live_area_sqm") for row in live_rows}
    lot_records = {record["new_reference"]: record for record in lot_map["records"]}

    post_users = collections.Counter(
        (record["legacy_domain"], record["legacy_post_id"]) for record in lot_map["records"]
    )

    records = []
    for reference, listing in sorted(listings.items()):
        lot = lot_records.get(reference)
        override = lot_overrides.get(reference) or {}
        property_record = properties.get(listing.get("property")) or {}
        family = property_record.get("property_family")
        candidates = list(FAMILY_AREA_FIELDS.get(family, ()))
        row = {
            "new_reference": reference,
            "property_id": property_record.get("id"),
            "property_family": family,
            "legacy_domain": lot["legacy_domain"] if lot else None,
            "legacy_post_id": lot["legacy_post_id"] if lot else None,
            "legacy_lot_id": resolved_lot_id(lot, override),
            "lot_id_override": override.get("action"),
            "area": parse_area(None),
            "total_area": parse_area(None),
            "source_meta_key": None,
            "proposed_sqm": None,
            "target_field": None,
            "field_candidates": candidates,
            "evidence": {"live_area_sqm": live_area.get(reference), "description_phrase": None},
            "status": "review",
            "review_reasons": [],
        }
        reasons = row["review_reasons"]

        if not lot:
            reasons.append("no_legacy_post")
            records.append(row)
            continue
        if post_users[(lot["legacy_domain"], lot["legacy_post_id"])] > 1:
            reasons.append("shared_legacy_post")

        meta = areas.get((lot["legacy_domain"], lot["legacy_post_id"]), {})
        row["area"] = parse_area(meta.get("wtf_area"))
        row["total_area"] = parse_area(meta.get("wtf_total_area"))
        if not meta:
            reasons.append("no_legacy_area")
            records.append(row)
            continue

        # `wtf_area` is the figure the legacy page published as the area. Where it
        # is missing, a plot's `wtf_total_area` is the same measurement under the
        # other key: on makler-realty.ru the plots carry only the total.
        chosen = row["area"]
        chosen_key = "wtf_area"
        if chosen["sqm"] is None and chosen["raw"] is None and family in FORCED_AREA_FIELD:
            chosen, chosen_key = row["total_area"], "wtf_total_area"
        row["source_meta_key"] = chosen_key if chosen["raw"] is not None else None
        row["proposed_sqm"] = chosen["sqm"]

        if chosen["reason"]:
            reasons.append(chosen["reason"])
        elif chosen["sqm"] is None:
            reasons.append("no_legacy_area")

        row["evidence"]["description_phrase"] = description_phrase(
            listing.get("facts", {}).get("description", ""), chosen["sqm"]
        )
        observed = live_area.get(reference)
        if chosen["sqm"] is not None and observed and abs(observed - chosen["sqm"]) > 0.5:
            reasons.append("live_audit_conflict")

        # A family with one area field can read both keys as that field, so the
        # two must agree. MS-CRAWL-0087 stores 20740 against 720 and needs a
        # human to say which one is the plot.
        #
        # For every other family a total area describes something the legacy
        # schema never named: on houses it is usually the plot, but
        # MS-CRAWL-0092 stores 514 built against 245 total, so no rule holds.
        # The value is carried for review and never proposed.
        if row["total_area"]["raw"] is None:
            pass
        elif family in FORCED_AREA_FIELD:
            # Only a post that stores both keys can contradict itself. A plot
            # that carries the total alone is the makler-realty.ru shape, not a
            # conflict.
            if row["area"]["raw"] is not None and row["area"]["sqm"] != row["total_area"]["sqm"]:
                reasons.append("conflicting_area_keys")
        elif chosen_key != "wtf_total_area":
            reasons.append("unmapped_total_area")

        if not family:
            reasons.append("no_property_family")
        elif family in FORCED_AREA_FIELD:
            row["target_field"] = FORCED_AREA_FIELD[family]
        else:
            reasons.append("field_choice_required")

        if chosen["sqm"] is not None and row["target_field"] and not _blocking(reasons):
            row["status"] = "ready"
        records.append(row)

    _flag_lot_conflicts(records)
    return _artifact(records, lot_map_path, seed_path, dump_dir)


# `unmapped_total_area` records a figure this run does not propose; it never
# invalidates the `wtf_area` value beside it. Every other reason does.
NON_BLOCKING_REASONS = frozenset({"unmapped_total_area"})


def _blocking(reasons: list[str]) -> bool:
    return any(reason not in NON_BLOCKING_REASONS for reason in reasons)


def _flag_lot_conflicts(records: list[dict]) -> None:
    """One lot listed on both domains must report one area."""
    by_lot = collections.defaultdict(list)
    for record in records:
        if record["legacy_lot_id"] and record["proposed_sqm"] is not None:
            by_lot[record["legacy_lot_id"]].append(record)
    for rows in by_lot.values():
        values = {row["proposed_sqm"] for row in rows}
        if len(values) < 2:
            continue
        for row in rows:
            row["review_reasons"].append("lot_area_conflict")
            row["status"] = "review"


def dump_provenance(dump_dir: pathlib.Path) -> dict:
    """Identify the backup, not where it happened to be unpacked.

    The absolute path is a property of one machine; the digest is what lets a
    reviewer confirm these figures came from the 2026-08-29 cPanel dump.
    """
    provenance = {}
    for database in DATABASES:
        path = dump_dir / f"{database}.sql"
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1 << 20), b""):
                digest.update(chunk)
        provenance[path.name] = {"bytes": path.stat().st_size, "sha256": digest.hexdigest()}
    return provenance


def _artifact(records: list[dict], lot_map_path: pathlib.Path, seed_path: pathlib.Path, dump_dir: pathlib.Path) -> dict:
    ready = [record for record in records if record["status"] == "ready"]
    review = [record for record in records if record["status"] != "ready"]
    reasons = collections.Counter(reason for record in records for reason in record["review_reasons"])
    return {
        "artifact_id": "legacy-area-map",
        "generated_from": {
            "dumps": dump_provenance(dump_dir),
            "lot_id_map": str(lot_map_path),
            "cms_seed": str(seed_path),
        },
        "approval": {
            "state": "review_required",
            "note": (
                "Proposals only. `node production/scripts/apply-legacy-area-facts.mjs --apply` "
                "writes the ready rows to the listing edit ledger; rows under review need a "
                "decision in production/data/legacy-area-overrides.json first."
            ),
        },
        "summary": {
            "listings": len(records),
            "with_legacy_area": sum(1 for record in records if record["area"]["raw"] or record["total_area"]["raw"]),
            "ready": len(ready),
            "review": len(review),
            "review_reasons": dict(sorted(reasons.items())),
        },
        "review": {
            reason: sorted(record["new_reference"] for record in records if reason in record["review_reasons"])
            for reason in sorted(reasons)
        },
        "records": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dump-dir", required=True, type=pathlib.Path)
    parser.add_argument("--lot-id-map", type=pathlib.Path, default=pathlib.Path("production/data/legacy-lot-id-map.json"))
    parser.add_argument(
        "--lot-id-overrides",
        type=pathlib.Path,
        default=pathlib.Path("production/data/legacy-lot-id-overrides.json"),
    )
    parser.add_argument("--seed", type=pathlib.Path, default=pathlib.Path("production/data/cms-seed.json"))
    parser.add_argument("--live-audit", type=pathlib.Path, default=pathlib.Path("production/data/live-listing-audit.json"))
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("production/data/legacy-area-map.json"))
    args = parser.parse_args()

    artifact = build(args.dump_dir.expanduser(), args.lot_id_map, args.seed, args.live_audit, args.lot_id_overrides)
    args.out.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(artifact["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
