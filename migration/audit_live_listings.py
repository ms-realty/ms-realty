#!/usr/bin/env python3
"""Compare the 165 canonical listing seeds with their live legacy pages."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from migration.crawl_inventory import DEFAULT_TIMEOUT, DEFAULT_WORKERS, FetchResult, PageParser, fetch
from search.build_search_indexes import (
    infer_bedrooms,
    load_geography_registry,
    load_location_reviews,
    reviewed_location_fields,
    textish,
)


DEFAULT_SEED = ROOT / "production" / "data" / "cms-seed.json"
DEFAULT_OUTPUT = ROOT / "production" / "data" / "live-listing-audit.json"
LOCATION_REVIEWS = ROOT / "production" / "data" / "location-reviews.json"
GEOGRAPHY_REGISTRY = ROOT / "production" / "data" / "geography-registry.json"
ENTITY_RE = re.compile(r"&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);", re.I)
RAW_TITLE_RE = re.compile(r"<title\b[^>]*>(.*?)</title>", re.I | re.S)
PRICE_RE = re.compile(r"(?:Цена|Стоимость)\s*:\s*([0-9][0-9\s.,\u00a0]*)\s*(?:€|EUR\b|евро\b)", re.I)
AREA_RE = re.compile(r"(?:Площ(?!\s+на\s+парцела)|Площадь\s+объекта)\s*:\s*([0-9][0-9\s.,\u00a0]*)\s*(?:m2|m²|кв\.?\s*м)\b", re.I)

CLASSIFICATION_WEIGHTS = {
    "source_404": 1000,
    "source_unavailable": 900,
    "source_non_html": 850,
    "source_content_review_required": 800,
    "price_drift": 700,
    "area_drift": 600,
    "title_mismatch": 500,
    "bedrooms_drift": 400,
    "location_review_required": 200,
    "missing_canonical_price": 150,
    "live_price_review_required": 125,
    "missing_canonical_area": 100,
    "review_required": 1,
}

LAUNCH_CANDIDATE_ALLOWED_CLASSIFICATIONS = {"missing_canonical_area", "review_required"}


def number(value: object) -> int | float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value) if float(value).is_integer() else float(value)
    raw = re.sub(r"\s+", "", str(value)).replace("\u00a0", "")
    if not raw:
        return None
    separators = [index for index, character in enumerate(raw) if character in ".,"]
    if separators:
        last = separators[-1]
        fractional_digits = len(raw) - last - 1
        if fractional_digits in {1, 2}:
            raw = re.sub(r"[.,]", "", raw[:last]) + "." + raw[last + 1 :]
        else:
            raw = re.sub(r"[.,]", "", raw)
    try:
        parsed = float(raw)
    except ValueError:
        return None
    return int(parsed) if parsed.is_integer() else parsed


def labeled_number(pattern: re.Pattern[str], text: str) -> int | float | None:
    match = pattern.search(text)
    return number(match.group(1)) if match else None


def fetch_state(result: FetchResult) -> str:
    if result.status == 404:
        return "not_found"
    if result.status != 200:
        return "fetch_error" if not result.status else "http_error"
    if result.error:
        return "fetch_error"
    if "html" not in result.content_type.lower():
        return "non_html"
    return "ok"


def live_facts(result: FetchResult) -> dict[str, object]:
    state = fetch_state(result)
    empty = {
        "fetch_state": state,
        "title": "",
        "title_entity": False,
        "content_scope": "",
        "price_eur": None,
        "area_sqm": None,
        "bedrooms": None,
    }
    if state != "ok":
        return empty

    try:
        parser = PageParser(result.final_url or result.url)
        parser.feed(result.body)
        parsed = parser.record()
    except Exception:
        return {**empty, "fetch_state": "parse_error"}

    raw_title = RAW_TITLE_RE.search(result.body)
    primary_text = str(parsed["content_text"]) if parsed["content_scope"] != "document_text_fallback" else ""
    title = textish(str(parsed["title"]))
    h1 = textish(str(parsed["h1"]))
    return {
        "fetch_state": state,
        "title": title,
        "title_entity": bool(raw_title and ENTITY_RE.search(raw_title.group(1))),
        "content_scope": parsed["content_scope"],
        "price_eur": labeled_number(PRICE_RE, primary_text),
        "area_sqm": labeled_number(AREA_RE, primary_text),
        "bedrooms": infer_bedrooms(" ".join((title, h1))),
    }


def audit_record(
    record: dict[str, object],
    result: FetchResult,
    reviews: dict[str, object],
    geography_areas: dict[str, dict[str, object]],
) -> dict[str, object]:
    listing_id = str(record["id"])
    facts = record.get("facts")
    if not isinstance(facts, dict):
        raise ValueError(f"Canonical listing {listing_id} has no facts object")

    media_workflow = record.get("media_workflow")
    if not isinstance(media_workflow, dict):
        media_workflow = {}

    live = live_facts(result)
    canonical_title = textish(str(facts.get("title") or ""))
    canonical_price = number(facts.get("price_eur"))
    canonical_area = number(facts.get("area_sqm"))
    canonical_bedrooms = number(facts.get("bedrooms"))
    live_price = live["price_eur"]
    live_area = live["area_sqm"]
    live_bedrooms = live["bedrooms"]

    try:
        reviewed = reviewed_location_fields(
            listing_id,
            textish(str(facts.get("location_legacy") or "")),
            reviews,
            geography_areas,
        )
        location_review_status = str(reviewed["location_review_status"])
        location_matches = bool(reviewed["location"]) and textish(str(reviewed["location"])) == textish(str(facts.get("location") or ""))
    except (KeyError, TypeError, ValueError):
        location_review_status = "mapping_error"
        location_matches = False

    classifications: set[str] = set()
    state = str(live["fetch_state"])
    if state == "not_found":
        classifications.add("source_404")
    elif state in {"fetch_error", "http_error", "parse_error"}:
        classifications.add("source_unavailable")
    elif state == "non_html":
        classifications.add("source_non_html")
    elif live["content_scope"] == "document_text_fallback":
        classifications.add("source_content_review_required")

    title_matches: bool | None = None
    if state == "ok":
        title_matches = canonical_title.casefold() == str(live["title"]).casefold()
        if not title_matches:
            classifications.add("title_mismatch")
    title_entity_normalized = bool(ENTITY_RE.search(str(facts.get("title") or "")) or live["title_entity"])

    if live_price is not None and canonical_price is not None and live_price != canonical_price:
        classifications.add("price_drift")
    elif live_price is not None and facts.get("price_on_request") is True:
        classifications.add("price_drift")
    elif live_price is not None and canonical_price is None:
        classifications.add("missing_canonical_price")
    elif state == "ok" and canonical_price is not None and live_price is None:
        classifications.add("live_price_review_required")

    if canonical_area is None:
        classifications.add("missing_canonical_area")
    elif live_area is not None and live_area != canonical_area:
        classifications.add("area_drift")
    if canonical_bedrooms is not None and live_bedrooms is not None and canonical_bedrooms != live_bedrooms:
        classifications.add("bedrooms_drift")
    if not location_matches or not location_review_status.startswith("confirmed_"):
        classifications.add("location_review_required")

    review_required = "review_required" in str(record.get("cms_status") or "") or bool(classifications)
    if review_required:
        classifications.add("review_required")
    ordered = sorted(classifications, key=lambda item: (-CLASSIFICATION_WEIGHTS[item], item))

    return {
        "id": listing_id,
        "source_url": str(record["source_url"]),
        "source_locale": str(record.get("source_locale") or ""),
        "public_gallery_assets": int(number(media_workflow.get("public_gallery_assets")) or 0),
        "word_count": int(number(facts.get("word_count")) or 0),
        "http_status": result.status or None,
        "fetch_state": state,
        "canonical_price_eur": canonical_price,
        "live_price_eur": live_price,
        "canonical_area_sqm": canonical_area,
        "live_area_sqm": live_area,
        "canonical_bedrooms": canonical_bedrooms,
        "live_bedrooms": live_bedrooms,
        "title_matches": title_matches,
        "title_entity_normalized": title_entity_normalized,
        "location_review_status": location_review_status,
        "location_matches_reviewed_mapping": location_matches,
        "classifications": ordered,
        "review_required": review_required,
        "selection_score": sum(CLASSIFICATION_WEIGHTS[item] for item in ordered),
    }


def load_seed(path: Path) -> list[dict[str, object]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("records") if isinstance(payload, dict) else None
    if not isinstance(records, list):
        raise ValueError("Canonical seed must contain a records array")
    ids = {str(record.get("id")) for record in records if isinstance(record, dict)}
    urls = {str(record.get("source_url")) for record in records if isinstance(record, dict)}
    if len(records) != 165 or len(ids) != 165 or len(urls) != 165 or "None" in ids or "None" in urls:
        raise ValueError("Canonical seed must contain exactly 165 unique listing ids and source URLs")
    return sorted(records, key=lambda record: str(record["id"]))


def run_audit(
    records: list[dict[str, object]],
    reviews: dict[str, object],
    geography_areas: dict[str, dict[str, object]],
    timeout: int = DEFAULT_TIMEOUT,
    workers: int = DEFAULT_WORKERS,
    fetcher: Callable[..., FetchResult] = fetch,
) -> list[dict[str, object]]:
    if timeout <= 0 or workers <= 0:
        raise ValueError("timeout and workers must be positive")

    def audit(record: dict[str, object]) -> dict[str, object]:
        try:
            result = fetcher(str(record["source_url"]), timeout=timeout)
        except Exception:
            result = FetchResult(url=str(record["source_url"]), error="fetch failed")
        return audit_record(record, result, reviews, geography_areas)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        return list(executor.map(audit, records))


def priority_review30(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    selected = sorted(rows, key=lambda row: (-int(row["selection_score"]), str(row["id"])))[:30]
    return [
        {
            "rank": rank,
            "id": row["id"],
            "source_url": row["source_url"],
            "selection_score": row["selection_score"],
            "classifications": row["classifications"],
        }
        for rank, row in enumerate(selected, 1)
    ]


def launch_candidate_score(row: dict[str, object]) -> int:
    return (
        (100 if row["source_locale"] == "bg" else 0)
        + min(int(row["public_gallery_assets"]), 30) * 5
        + min(int(row["word_count"]), 1000) // 10
        + (50 if row["canonical_price_eur"] == row["live_price_eur"] and row["canonical_price_eur"] is not None else 0)
    )


def launch_candidate30(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    eligible = [
        row
        for row in rows
        if row["fetch_state"] == "ok"
        and row["title_matches"] is True
        and row["live_area_sqm"] is not None
        and row["location_matches_reviewed_mapping"] is True
        and str(row["location_review_status"]).startswith("confirmed_")
        and int(row["public_gallery_assets"]) >= 3
        and set(row["classifications"]).issubset(LAUNCH_CANDIDATE_ALLOWED_CLASSIFICATIONS)
    ]
    selected = sorted(eligible, key=lambda row: (-launch_candidate_score(row), str(row["id"])))[:30]
    return [
        {
            "rank": rank,
            "id": row["id"],
            "source_url": row["source_url"],
            "candidate_score": launch_candidate_score(row),
            "source_locale": row["source_locale"],
            "public_gallery_assets": row["public_gallery_assets"],
            "word_count": row["word_count"],
            "observed_area_sqm": row["live_area_sqm"],
            "remaining_launch_blockers": [
                "broker_map_and_verify_observed_area",
                "complete_human_listing_review",
            ],
        }
        for rank, row in enumerate(selected, 1)
    ]


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def repo_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def build_report(
    rows: list[dict[str, object]],
    seed_path: Path,
    reviews_path: Path,
    geography_path: Path,
    generated_at: str,
) -> dict[str, object]:
    classifications = Counter(item for row in rows for item in row["classifications"])
    states = Counter(str(row["fetch_state"]) for row in rows)
    return {
        "schema_version": 1,
        "generated_at": generated_at,
        "inputs": {
            "canonical_seed": repo_path(seed_path),
            "canonical_seed_sha256": file_hash(seed_path),
            "location_reviews": repo_path(reviews_path),
            "location_reviews_sha256": file_hash(reviews_path),
            "geography_registry": repo_path(geography_path),
            "geography_registry_sha256": file_hash(geography_path),
        },
        "summary": {
            "canonical_listing_count": len(rows),
            "audited_listing_count": len(rows),
            "review_required_count": sum(row["review_required"] is True for row in rows),
            "live_area_observed_count": sum(row["live_area_sqm"] is not None for row in rows),
            "live_price_observed_count": sum(row["live_price_eur"] is not None for row in rows),
            "title_entity_normalized_count": sum(row["title_entity_normalized"] is True for row in rows),
            "fetch_state_counts": dict(sorted(states.items())),
            "classification_counts": dict(sorted(classifications.items())),
        },
        "priority_review30_policy": {
            "limit": 30,
            "score": "sum of classification weights",
            "classification_weights": CLASSIFICATION_WEIGHTS,
            "tie_breaker": "listing id ascending",
        },
        "priority_review30": priority_review30(rows),
        "launch_candidate30_policy": {
            "limit": 30,
            "purpose": "manual review queue only; never publication approval",
            "requirements": [
                "live source is 200 HTML with matching normalized title",
                "reviewed location mapping is confirmed and matches canonical data",
                "live area is observed and at least 3 public gallery assets exist",
                "only missing_canonical_area and review_required classifications remain",
            ],
            "score": "BG source + public gallery depth + canonical word count + exact live/canonical price parity",
            "tie_breaker": "listing id ascending",
        },
        "launch_candidate30": launch_candidate30(rows),
        "listings": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=Path, default=DEFAULT_SEED)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    parser.add_argument("--generated-at", default=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    args = parser.parse_args()

    records = load_seed(args.seed)
    reviews = load_location_reviews(LOCATION_REVIEWS)
    geography = load_geography_registry(GEOGRAPHY_REGISTRY)
    rows = run_audit(records, reviews, geography, timeout=args.timeout, workers=args.workers)
    if not args.generated_at or datetime.fromisoformat(args.generated_at.replace("Z", "+00:00")).tzinfo is None:
        raise ValueError("generated-at must be a timezone-aware ISO timestamp")
    report = build_report(rows, args.seed, LOCATION_REVIEWS, GEOGRAPHY_REGISTRY, args.generated_at)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
