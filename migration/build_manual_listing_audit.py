#!/usr/bin/env python3
"""Validate manual live-source reviews and build the broker sign-off packet."""

from __future__ import annotations

import argparse
import csv
import io
import json
from collections import Counter
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BATCH_DIR = ROOT / "migration" / "reviews" / "manual-live-audit"
DEFAULT_LIVE_AUDIT = ROOT / "production" / "data" / "live-listing-audit.json"
DEFAULT_SEED = ROOT / "production" / "data" / "cms-seed.json"
DEFAULT_AUDIT_OUTPUT = ROOT / "production" / "data" / "manual-listing-audit.json"
DEFAULT_PACKET_OUTPUT = ROOT / "production" / "data" / "launch-candidate30-broker-packet.json"
DEFAULT_PACKET_CSV = ROOT / "production" / "data" / "launch-candidate30-broker-packet.csv"
REVIEWER_KIND = "codex_manual_source_review_not_broker_approval"
REVIEW_STATUSES = {"pass", "review", "hold", "source_unavailable"}
OBSERVED_FIELDS = {
    "title",
    "price_eur_or_por",
    "area_sqm_or_unknown",
    "bedrooms_or_unknown",
    "location_or_unknown",
    "property_scope",
    "availability_signal",
    "gallery_assets_observed_or_sampled",
}


def read_json(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def timestamp(value: object, label: str) -> datetime:
    raw = str(value or "")
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{label} must be an ISO timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a timezone")
    return parsed


def text_list(value: object, label: str) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value):
        raise ValueError(f"{label} must be an array of non-empty strings")
    return value


def validate_batches(
    batches: list[dict[str, object]],
    canonical_rows: list[dict[str, object]],
) -> list[dict[str, object]]:
    reviews: list[dict[str, object]] = []
    for batch_number, batch in enumerate(batches, 1):
        if batch.get("schema_version") != 1 or batch.get("reviewer_kind") != REVIEWER_KIND:
            raise ValueError(f"batch {batch_number} has an invalid review contract")
        rows = batch.get("listings")
        if not isinstance(rows, list) or batch.get("count") != len(rows):
            raise ValueError(f"batch {batch_number} count does not match listings")
        reviews.extend(rows)

    if len(reviews) != len(canonical_rows):
        raise ValueError(f"manual review must cover {len(canonical_rows)} listings, got {len(reviews)}")

    canonical_by_id = {str(row["id"]): row for row in canonical_rows}
    seen: set[str] = set()
    for index, review in enumerate(reviews):
        if not isinstance(review, dict):
            raise ValueError(f"manual review row {index} must be an object")
        listing_id = str(review.get("id") or "")
        if listing_id in seen:
            raise ValueError(f"duplicate manual review listing: {listing_id}")
        seen.add(listing_id)
        canonical = canonical_by_id.get(listing_id)
        if not canonical:
            raise ValueError(f"unknown manual review listing: {listing_id}")
        if review.get("source_url") != canonical.get("source_url"):
            raise ValueError(f"manual review source URL drift: {listing_id}")
        if review.get("review_status") not in REVIEW_STATUSES:
            raise ValueError(f"manual review status is invalid: {listing_id}")
        timestamp(review.get("checked_at"), f"{listing_id} checked_at")
        status = review.get("http_status")
        if status is not None and (not isinstance(status, int) or isinstance(status, bool)):
            raise ValueError(f"manual review http_status is invalid: {listing_id}")
        observed = review.get("observed")
        if not isinstance(observed, dict) or set(observed) != OBSERVED_FIELDS:
            raise ValueError(f"manual review observed fields are invalid: {listing_id}")
        text_list(review.get("issues"), f"{listing_id} issues")
        text_list(review.get("broker_confirm"), f"{listing_id} broker_confirm")
        if not isinstance(review.get("required_action"), str) or not str(review["required_action"]).strip():
            raise ValueError(f"manual review required_action is missing: {listing_id}")

    if seen != set(canonical_by_id):
        raise ValueError("manual review listing ids do not exactly cover the live audit")
    return sorted(reviews, key=lambda row: str(row["id"]))


def build_manual_audit(reviews: list[dict[str, object]]) -> dict[str, object]:
    statuses = Counter(str(row["review_status"]) for row in reviews)
    issue_counts = Counter(issue for row in reviews for issue in row["issues"])
    checked_at = str(max(reviews, key=lambda row: timestamp(row["checked_at"], "checked_at"))["checked_at"])
    return {
        "schema_version": 1,
        "generated_at": checked_at,
        "reviewer_kind": REVIEWER_KIND,
        "broker_approval_granted": False,
        "summary": {
            "listings": len(reviews),
            "review_status_counts": dict(sorted(statuses.items())),
            "issue_counts": dict(sorted(issue_counts.items())),
            "broker_confirmation_required": sum(bool(row["broker_confirm"]) for row in reviews),
        },
        "listings": reviews,
    }


def candidate_packet(
    live_audit: dict[str, object],
    seed: dict[str, object],
    reviews: list[dict[str, object]],
) -> dict[str, object]:
    candidates = live_audit.get("launch_candidate30")
    records = seed.get("records")
    properties = seed.get("properties")
    if not isinstance(candidates, list) or not isinstance(records, list) or not isinstance(properties, list):
        raise ValueError("candidate packet inputs are invalid")
    if len(candidates) != 30:
        raise ValueError(f"launch candidate packet must contain 30 rows, got {len(candidates)}")
    previous_candidate_ids = [str(row.get("id") or "") for row in candidates if isinstance(row, dict)]
    if len(previous_candidate_ids) != 30 or len(set(previous_candidate_ids)) != 30:
        raise ValueError("launch candidate packet must contain 30 unique listing ids")

    audit_by_id = {str(row["id"]): row for row in live_audit["listings"]}
    record_by_id = {str(row.get("id")): row for row in records if isinstance(row, dict)}
    property_by_id = {str(row.get("id")): row for row in properties if isinstance(row, dict)}
    review_by_id = {str(row["id"]): row for row in reviews}
    previous_rank_by_id = {str(row["id"]): row["rank"] for row in candidates}
    manual_pass = [row for row in reviews if row["review_status"] == "pass"]
    if len(manual_pass) != 30:
        raise ValueError(f"broker packet requires exactly 30 manual source passes, got {len(manual_pass)}")
    selected = sorted(
        manual_pass,
        key=lambda row: (-int(audit_by_id[str(row["id"])].get("selection_score") or 0), str(row["id"])),
    )
    packet_rows = []
    for rank, manual in enumerate(selected, 1):
        listing_id = str(manual["id"])
        listing = record_by_id[listing_id]
        live = audit_by_id[listing_id]
        manual = review_by_id[listing_id]
        facts = listing.get("facts") if isinstance(listing.get("facts"), dict) else {}
        seo = listing.get("seo") if isinstance(listing.get("seo"), dict) else {}
        media = listing.get("media_workflow") if isinstance(listing.get("media_workflow"), dict) else {}
        property_row = property_by_id.get(str(listing.get("property")), {})
        translations = listing.get("translations") if isinstance(listing.get("translations"), list) else []
        blockers = [
            "broker_confirm_current_availability",
            "broker_confirm_price_or_price_on_request",
            "broker_confirm_property_scope_and_type",
            "broker_confirm_location_and_public_precision",
            "broker_confirm_area_semantics_or_explicit_unknown",
            "broker_confirm_media_selection",
            "assign_verified_public_contact",
            "human_approve_seo",
            *manual["broker_confirm"],
        ]
        packet_rows.append(
            {
                "rank": rank,
                "id": listing_id,
                "selection_score": live.get("selection_score"),
                "previous_launch_candidate_rank": previous_rank_by_id.get(listing_id),
                "manual_review_status": manual["review_status"],
                "publish_ready": False,
                "broker_approval_required": True,
                "source": {
                    "url": listing["source_url"],
                    "http_status": manual["http_status"],
                    "checked_at": manual["checked_at"],
                },
                "price": {
                    "canonical_eur": facts.get("price_eur"),
                    "canonical_price_on_request": facts.get("price_on_request") is True,
                    "crawl_observed_eur": live.get("live_price_eur"),
                    "manual_observed": manual["observed"]["price_eur_or_por"],
                    "approval": "broker_required",
                },
                "property_type": {
                    "legacy": facts.get("property_type"),
                    "family": property_row.get("property_family"),
                    "subtype": property_row.get("property_subtype"),
                    "manual_scope": manual["observed"]["property_scope"],
                    "approval": "broker_required",
                },
                "location": {
                    "canonical": facts.get("location") or None,
                    "precision": facts.get("location_precision") or None,
                    "manual_observed": manual["observed"]["location_or_unknown"],
                    "approval": "broker_required",
                },
                "area": {
                    "canonical_sqm": facts.get("area_sqm"),
                    "crawl_observed_sqm": live.get("live_area_sqm"),
                    "manual_observed": manual["observed"]["area_sqm_or_unknown"],
                    "approval": "broker_required_or_explicit_unknown",
                },
                "bedrooms": {
                    "canonical": facts.get("bedrooms"),
                    "manual_observed": manual["observed"]["bedrooms_or_unknown"],
                    "approval": "broker_required_when_applicable",
                },
                "media": {
                    "public_gallery_assets": media.get("public_gallery_assets", 0),
                    "manual_sample": manual["observed"]["gallery_assets_observed_or_sampled"],
                    "approval": "broker_required",
                },
                "locale": {
                    "source": listing.get("source_locale"),
                    "public_translations": [
                        row.get("locale")
                        for row in translations
                        if isinstance(row, dict) and row.get("public_indexable") is True and row.get("human_approved") is True
                    ],
                    "approval": "human_translation_review_retained",
                },
                "seo": {
                    "title": seo.get("title") or "",
                    "description": seo.get("description") or "",
                    "human_approved": seo.get("human_approved") is True,
                    "manual_title": manual["observed"]["title"],
                    "approval": "human_required",
                },
                "contact": {"verified_public_contact": None, "approval": "owner_required"},
                "availability": {
                    "canonical_status": facts.get("listing_status"),
                    "manual_signal": manual["observed"]["availability_signal"],
                    "approval": "broker_required",
                },
                "issues": manual["issues"],
                "required_action": manual["required_action"],
                "remaining_blockers": list(dict.fromkeys(blockers)),
            }
        )

    return {
        "schema_version": 1,
        "generated_at": str(
            max(packet_rows, key=lambda row: timestamp(row["source"]["checked_at"], "checked_at"))["source"]["checked_at"]
        ),
        "purpose": "broker sign-off packet; never publication approval",
        "selection_basis": "manual_source_pass_then_live_selection_score",
        "previous_launch_candidate_overlap": sum(row["previous_launch_candidate_rank"] is not None for row in packet_rows),
        "publish_ready_count": 0,
        "candidate_count": len(packet_rows),
        "listings": packet_rows,
    }


def render_packet_csv(packet: dict[str, object]) -> str:
    output = io.StringIO(newline="")
    fields = [
        "rank",
        "id",
        "source_url",
        "manual_review_status",
        "issues",
        "required_action",
        "broker_confirm",
        "availability_confirmation",
        "facts_reviewer",
        "media_reviewer",
        "approved_at",
    ]
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for row in packet["listings"]:
        writer.writerow(
            {
                "rank": row["rank"],
                "id": row["id"],
                "source_url": row["source"]["url"],
                "manual_review_status": row["manual_review_status"],
                "issues": "|".join(row["issues"]),
                "required_action": row["required_action"],
                "broker_confirm": "|".join(row["remaining_blockers"]),
                "availability_confirmation": "",
                "facts_reviewer": "",
                "media_reviewer": "",
                "approved_at": "",
            }
        )
    return output.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-dir", type=Path, default=DEFAULT_BATCH_DIR)
    parser.add_argument("--live-audit", type=Path, default=DEFAULT_LIVE_AUDIT)
    parser.add_argument("--seed", type=Path, default=DEFAULT_SEED)
    parser.add_argument("--audit-output", type=Path, default=DEFAULT_AUDIT_OUTPUT)
    parser.add_argument("--packet-output", type=Path, default=DEFAULT_PACKET_OUTPUT)
    parser.add_argument("--packet-csv", type=Path, default=DEFAULT_PACKET_CSV)
    args = parser.parse_args()

    live_audit = read_json(args.live_audit)
    seed = read_json(args.seed)
    canonical_rows = live_audit.get("listings")
    if not isinstance(canonical_rows, list) or len(canonical_rows) != 165:
        raise ValueError("live listing audit must contain exactly 165 listings")
    batch_paths = sorted(args.batch_dir.glob("batch-*.json"))
    if len(batch_paths) != 3:
        raise ValueError(f"manual live audit requires exactly 3 batch files, got {len(batch_paths)}")
    reviews = validate_batches([read_json(path) for path in batch_paths], canonical_rows)
    audit = build_manual_audit(reviews)
    packet = candidate_packet(live_audit, seed, reviews)

    for path in (args.audit_output, args.packet_output, args.packet_csv):
        path.parent.mkdir(parents=True, exist_ok=True)
    args.audit_output.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.packet_output.write_text(json.dumps(packet, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.packet_csv.write_text(render_packet_csv(packet), encoding="utf-8")
    print(json.dumps({"audited": len(reviews), "candidates": len(packet["listings"]), "publish_ready": 0}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
