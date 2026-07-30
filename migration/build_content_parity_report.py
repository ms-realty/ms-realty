#!/usr/bin/env python3
"""Build an audit-only parity report for legacy content capture and CMS migration.

The report deliberately distinguishes a review-gated CMS seed from content that
has an explicit approved-CMS source link.  It never imports or publishes text.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit, urlunsplit


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EVIDENCE_DIR = ROOT / "migration" / "content-evidence" / "20260729-legacy-content-review"
DEFAULT_CRAWL_INVENTORY = ROOT / "migration" / "artifacts" / "20260704-211155" / "url-inventory.csv"
DEFAULT_ROUTE_MAP = ROOT / "production" / "data" / "legacy-route-map.json"
DEFAULT_APPROVED_CMS_CONTENT = ROOT / "production" / "data" / "approved-cms-content.json"
DEFAULT_CMS_SEED = ROOT / "production" / "data" / "cms-seed.json"
DEFAULT_FOCUS_SOURCE_DOMAIN = "makler-realty.com"

CONTENT_FILE = "content-inventory.jsonl"
SKIPPED_FILE = "content-capture-skipped.csv"
MANIFEST_FILE = "content-evidence-manifest.json"
DIRECT_LEGACY_URL_FIELDS = ("legacy_url", "source_url", "old_url", "source_document_url")
DIRECT_LEGACY_HASH_FIELDS = ("legacy_text_sha256", "source_text_sha256", "text_sha256")


def text(value: object) -> str:
    return str(value or "").strip()


def path_label(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def url_key(value: object) -> str:
    """Keep source URL spelling distinct while normalizing scheme and host only.

    The legacy inventory contains differently percent-encoded sitemap entries
    for the same browser destination. Collapsing them would hide required
    route-by-route dispositions, so path and query spelling remain exact.
    """

    raw = text(value)
    parsed = urlsplit(raw)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"Expected absolute URL, got: {raw!r}")
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, parsed.query, ""))


def require_fields(rows: Iterable[dict[str, Any]], fields: Iterable[str], label: str) -> None:
    required = set(fields)
    for index, row in enumerate(rows, start=1):
        missing = sorted(field for field in required if not text(row.get(field)))
        if missing:
            raise ValueError(f"{label} row {index} is missing required fields: {', '.join(missing)}")


def read_csv_rows(path: Path, required_fields: Iterable[str], label: str) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or not set(required_fields).issubset(reader.fieldnames):
            raise ValueError(f"{label} must include columns {sorted(required_fields)}: {path}")
        rows = [dict(row) for row in reader]
    require_fields(rows, required_fields, label)
    return rows


def read_json(path: Path, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid {label} JSON: {path}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be a JSON object: {path}")
    return payload


def read_jsonl_rows(path: Path, required_fields: Iterable[str], label: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid {label} JSONL row {line_number}: {path}") from exc
        if not isinstance(row, dict):
            raise ValueError(f"{label} JSONL row {line_number} is not an object: {path}")
        rows.append(row)
    require_fields(rows, required_fields, label)
    return rows


def index_rows(rows: Iterable[dict[str, Any]], url_field: str, label: str) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = url_key(row.get(url_field))
        if key in indexed:
            raise ValueError(f"{label} contains a duplicate URL: {row.get(url_field)}")
        indexed[key] = row
    return indexed


def number_or_none(value: object) -> int | None:
    value = text(value)
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def manifest_integrity(
    manifest: dict[str, Any] | None,
    crawl_inventory: Path,
    content_path: Path,
    skipped_path: Path,
    captured: list[dict[str, Any]],
    skipped: list[dict[str, Any]],
) -> dict[str, Any]:
    if manifest is None:
        return {"present": False, "valid": False, "errors": ["content evidence manifest is missing"]}

    errors: list[str] = []
    if manifest.get("schema_version") != 1:
        errors.append("content evidence manifest schema_version must be 1")
    source = manifest.get("source_inventory") if isinstance(manifest.get("source_inventory"), dict) else {}
    if source.get("sha256") != sha256_file(crawl_inventory):
        errors.append("content evidence manifest source inventory hash does not match crawl inventory")

    files = manifest.get("files") if isinstance(manifest.get("files"), dict) else {}
    for filename, path, rows in ((CONTENT_FILE, content_path, captured), (SKIPPED_FILE, skipped_path, skipped)):
        file_info = files.get(filename) if isinstance(files.get(filename), dict) else {}
        if file_info.get("sha256") != sha256_file(path):
            errors.append(f"content evidence manifest hash does not match {filename}")
        if file_info.get("rows") != len(rows):
            errors.append(f"content evidence manifest row count does not match {filename}")

    counts = manifest.get("counts") if isinstance(manifest.get("counts"), dict) else {}
    if counts.get("source_urls") != len(captured) + len(skipped):
        errors.append("content evidence manifest source_urls count does not match evidence rows")
    if counts.get("captured") != len(captured) or counts.get("skipped") != len(skipped):
        errors.append("content evidence manifest captured/skipped counts do not match evidence rows")
    return {"present": True, "valid": not errors, "errors": errors}


def direct_legacy_urls(document: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    for field in DIRECT_LEGACY_URL_FIELDS:
        value = text(document.get(field))
        if value:
            urls.append(url_key(value))
    return sorted(set(urls))


def direct_legacy_hashes(document: dict[str, Any]) -> list[str]:
    hashes = [text(document.get(field)).lower() for field in DIRECT_LEGACY_HASH_FIELDS if text(document.get(field))]
    return sorted(set(hashes))


def is_approved_document(document: dict[str, Any]) -> bool:
    return document.get("status") == "approved" and document.get("human_approved") is True


def source_domain_for(key: str) -> str:
    return urlsplit(key).netloc.lower()


def source_metadata(*rows: dict[str, Any] | None, fallback_url: str) -> tuple[str, str]:
    for row in rows:
        if row:
            domain = text(row.get("source_domain"))
            url_type = text(row.get("url_type"))
            if domain or url_type:
                return domain or source_domain_for(fallback_url), url_type or "unknown"
    return source_domain_for(fallback_url), "unknown"


def capture_state(captured: dict[str, Any] | None, skipped: dict[str, Any] | None) -> dict[str, Any]:
    if captured is not None:
        return {
            "state": "captured",
            "http_status": number_or_none(captured.get("status")),
            "reason": "",
            "text_sha256": text(captured.get("text_sha256")),
            "content_word_count": number_or_none(captured.get("content_word_count")),
        }
    if skipped is None:
        return {"state": "unavailable", "http_status": None, "reason": "no_capture_or_skip_record"}
    status = number_or_none(skipped.get("status"))
    reason = text(skipped.get("reason"))
    if reason == "robots_disallowed":
        state = "robots"
    elif status == 404:
        state = "404"
    else:
        state = "unavailable"
    return {
        "state": state,
        "http_status": status,
        "reason": reason or "capture_skipped",
        "detail": text(skipped.get("detail")),
    }


def route_state(route: dict[str, Any] | None) -> dict[str, Any]:
    if route is None:
        return {"present": False, "mapping_state": "missing", "target_path": None, "planned_status": None}
    target_path = text(route.get("target_path")) or None
    deployable = route.get("deployable") is True
    review_required = route.get("review_required") is True
    if target_path:
        mapping_state = "mapped_deployable" if deployable else "mapped_for_review"
    else:
        mapping_state = "unresolved_review_required" if review_required else "unresolved"
    return {
        "present": True,
        "mapping_state": mapping_state,
        "target_path": target_path,
        "planned_status": route.get("planned_status"),
        "deployable": deployable,
        "review_required": review_required,
        "review_state": text(route.get("review_state")) or None,
        "reason": text(route.get("reason")),
    }


def count_by(rows: Iterable[dict[str, Any]], field: str) -> dict[str, int]:
    counter = Counter(text(row.get(field)) or "unknown" for row in rows)
    return dict(sorted(counter.items()))


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "urls": len(rows),
        "crawl_inventory_urls": sum(row["crawl_inventory_present"] for row in rows),
        "captured": sum(row["capture"]["state"] == "captured" for row in rows),
        "used": sum(row["content_status"] == "used" for row in rows),
        "seeded_for_review": sum(row["content_status"] == "seeded_for_review" for row in rows),
        "unused": sum(row["content_status"] == "unused" for row in rows),
        "robots": sum(row["content_status"] == "robots" for row in rows),
        "404": sum(row["content_status"] == "404" for row in rows),
        "unavailable": sum(row["content_status"] == "unavailable" for row in rows),
        "route_mapped": sum(bool(row["route"]["target_path"]) for row in rows),
        "route_unresolved": sum(row["route"]["mapping_state"].startswith("unresolved") for row in rows),
    }


def group_summaries(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(row["source_domain"], row["url_type"])].append(row)
    return [
        {"source_domain": domain, "url_type": url_type, **summarize_rows(grouped[(domain, url_type)])}
        for domain, url_type in sorted(grouped)
    ]


def build_report(
    *,
    crawl_inventory_path: Path = DEFAULT_CRAWL_INVENTORY,
    evidence_dir: Path = DEFAULT_EVIDENCE_DIR,
    route_map_path: Path = DEFAULT_ROUTE_MAP,
    approved_cms_content_path: Path = DEFAULT_APPROVED_CMS_CONTENT,
    cms_seed_path: Path = DEFAULT_CMS_SEED,
    focus_source_domain: str = DEFAULT_FOCUS_SOURCE_DOMAIN,
    generated_at_utc: str | None = None,
) -> dict[str, Any]:
    crawl_rows = read_csv_rows(crawl_inventory_path, ("source_domain", "url", "url_type"), "crawl inventory")
    crawl_by_url = index_rows(crawl_rows, "url", "crawl inventory")

    content_path = evidence_dir / CONTENT_FILE
    skipped_path = evidence_dir / SKIPPED_FILE
    manifest_path = evidence_dir / MANIFEST_FILE
    captured_rows = read_jsonl_rows(content_path, ("source_domain", "url", "url_type", "text_sha256"), "captured content")
    skipped_rows = read_csv_rows(skipped_path, ("source_domain", "url", "url_type", "reason"), "skipped content")
    captured_by_url = index_rows(captured_rows, "url", "captured content")
    skipped_by_url = index_rows(skipped_rows, "url", "skipped content")
    overlap = sorted(set(captured_by_url) & set(skipped_by_url))
    if overlap:
        raise ValueError(f"Captured and skipped evidence overlap for {len(overlap)} URL(s)")
    manifest = read_json(manifest_path, "content evidence manifest") if manifest_path.exists() else None
    evidence_integrity = manifest_integrity(
        manifest, crawl_inventory_path, content_path, skipped_path, captured_rows, skipped_rows
    )

    route_payload = read_json(route_map_path, "legacy route map")
    route_rows = route_payload.get("routes")
    if not isinstance(route_rows, list):
        raise ValueError(f"Legacy route map must contain routes: {route_map_path}")
    require_fields(route_rows, ("old_url", "source_domain", "url_type"), "legacy route map")
    route_by_url = index_rows(route_rows, "old_url", "legacy route map")

    approved_payload = read_json(approved_cms_content_path, "approved CMS content")
    approved_documents = approved_payload.get("documents")
    if not isinstance(approved_documents, list):
        raise ValueError(f"Approved CMS content must contain documents: {approved_cms_content_path}")
    approved_by_url: dict[str, list[dict[str, Any]]] = defaultdict(list)
    approved_document_rows: list[dict[str, Any]] = []
    for document in approved_documents:
        if not isinstance(document, dict):
            raise ValueError("Approved CMS content document must be an object")
        urls = direct_legacy_urls(document)
        hashes = direct_legacy_hashes(document)
        approved = is_approved_document(document)
        for key in urls:
            if approved:
                approved_by_url[key].append(document)
        approved_document_rows.append(
            {
                "id": text(document.get("id")) or "unknown",
                "type": text(document.get("type")) or "unknown",
                "title": text(document.get("title")),
                "path": text(document.get("path")) or None,
                "status": text(document.get("status")) or "unknown",
                "human_approved": document.get("human_approved") is True,
                "legacy_migration": document.get("legacy_migration") is True,
                "direct_legacy_urls": urls,
                "has_direct_legacy_text_hash": bool(hashes),
                "link_state": (
                    "direct_legacy_url_linked"
                    if urls and approved
                    else "legacy_marked_unlinked"
                    if document.get("legacy_migration") is True
                    else "not_legacy_migration"
                ),
            }
        )

    seed_payload = read_json(cms_seed_path, "CMS seed")
    seed_rows = seed_payload.get("records")
    if not isinstance(seed_rows, list):
        raise ValueError(f"CMS seed must contain records: {cms_seed_path}")
    seed_by_url: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for seed in seed_rows:
        if not isinstance(seed, dict):
            raise ValueError("CMS seed record must be an object")
        source_url = text(seed.get("source_url"))
        if source_url:
            seed_by_url[url_key(source_url)].append(seed)

    all_urls = sorted(set(crawl_by_url) | set(captured_by_url) | set(skipped_by_url) | set(route_by_url) | set(approved_by_url) | set(seed_by_url))
    report_rows: list[dict[str, Any]] = []
    for key in all_urls:
        crawl = crawl_by_url.get(key)
        captured = captured_by_url.get(key)
        skipped = skipped_by_url.get(key)
        route = route_by_url.get(key)
        source_domain, url_type = source_metadata(crawl, captured, skipped, route, fallback_url=key)
        capture = capture_state(captured, skipped)
        direct_documents = approved_by_url.get(key, [])
        approved_ids: list[str] = []
        approved_hash_mismatch_ids: list[str] = []
        for document in direct_documents:
            document_id = text(document.get("id")) or "unknown"
            hashes = direct_legacy_hashes(document)
            if capture["state"] == "captured" and hashes and capture.get("text_sha256") not in hashes:
                approved_hash_mismatch_ids.append(document_id)
            else:
                approved_ids.append(document_id)
        seed_records = seed_by_url.get(key, [])
        seed_ids = [text(seed.get("id")) or "unknown" for seed in seed_records]

        if capture["state"] in {"robots", "404", "unavailable"}:
            content_status = capture["state"]
            status_reason = capture["reason"]
        elif approved_ids:
            content_status = "used"
            status_reason = "explicit_approved_cms_legacy_url_link"
        elif seed_ids:
            content_status = "seeded_for_review"
            status_reason = "cms_seed_source_link_is_review_gated_not_public_usage"
        else:
            content_status = "unused"
            status_reason = "captured_without_explicit_approved_cms_or_seed_source_link"

        report_rows.append(
            {
                "url": crawl.get("url") if crawl else (captured or skipped or route or {}).get("url") or (route or {}).get("old_url") or key,
                "source_domain": source_domain,
                "url_type": url_type,
                "crawl_inventory_present": crawl is not None,
                "capture": capture,
                "route": route_state(route),
                "approved_cms_document_ids": sorted(approved_ids),
                "approved_cms_hash_mismatch_document_ids": sorted(approved_hash_mismatch_ids),
                "cms_seed_record_ids": sorted(seed_ids),
                "cms_seed_statuses": sorted({text(seed.get("cms_status")) or "unknown" for seed in seed_records}),
                "content_status": content_status,
                "status_reason": status_reason,
            }
        )

    report_rows.sort(key=lambda row: (row["source_domain"], row["url"]))
    focus_rows = [row for row in report_rows if row["source_domain"] == focus_source_domain]
    approved_legacy = [row for row in approved_document_rows if row["legacy_migration"]]
    direct_approved_ids = {
        text(document.get("id")) or "unknown"
        for documents in approved_by_url.values()
        for document in documents
    }
    seed_statuses = Counter(text(seed.get("cms_status")) or "unknown" for seed in seed_rows)
    coverage = {
        "crawl_missing_content_evidence": sorted(
            crawl_by_url.keys() - set(captured_by_url) - set(skipped_by_url)
        ),
        "content_evidence_missing_crawl": sorted(
            (set(captured_by_url) | set(skipped_by_url)) - crawl_by_url.keys()
        ),
        "crawl_missing_route_map": sorted(crawl_by_url.keys() - route_by_url.keys()),
        "route_map_missing_crawl": sorted(route_by_url.keys() - crawl_by_url.keys()),
        "approved_cms_links_missing_crawl": sorted(set(approved_by_url) - crawl_by_url.keys()),
        "cms_seed_links_missing_crawl": sorted(set(seed_by_url) - crawl_by_url.keys()),
    }
    captured_without_direct_approved_link = [
        row["url"]
        for row in report_rows
        if row["capture"]["state"] == "captured" and not row["approved_cms_document_ids"]
    ]
    unresolved_non_listing = [
        row
        for row in report_rows
        if row["url_type"] != "listing" and row["route"]["mapping_state"].startswith("unresolved")
    ]
    summary = summarize_rows(report_rows)
    focus_summary = summarize_rows(focus_rows)
    summary["content_statuses"] = count_by(report_rows, "content_status")
    focus_summary["content_statuses"] = count_by(focus_rows, "content_status")
    report = {
        "schema_version": 1,
        "generated_at_utc": generated_at_utc or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scope": {
            "focus_source_domain": focus_source_domain,
            "content_status_meanings": {
                "used": "Captured text has an explicit approved-CMS legacy URL link (and any supplied text hash matches).",
                "seeded_for_review": "A CMS seed references the legacy URL, but its review-gated status is not public usage or publication.",
                "unused": "Captured text has neither an explicit approved-CMS link nor a CMS seed source link.",
                "robots": "Capture respected robots.txt and did not fetch the legacy URL.",
                "404": "The capture request received HTTP 404; it is not content available for import.",
                "unavailable": "No usable captured content is available, including missing evidence or non-404 fetch failures.",
            },
        },
        "inputs": {
            "crawl_inventory": path_label(crawl_inventory_path),
            "content_evidence_dir": path_label(evidence_dir),
            "legacy_route_map": path_label(route_map_path),
            "approved_cms_content": path_label(approved_cms_content_path),
            "cms_seed": path_label(cms_seed_path),
        },
        "integrity": {
            "content_evidence_manifest": evidence_integrity,
            "coverage": {key: {"count": len(value), "urls": value} for key, value in coverage.items()},
        },
        "summary": {
            "all_sources": summary,
            "focus_source": {"source_domain": focus_source_domain, **focus_summary},
            "approved_cms": {
                "documents": len(approved_documents),
                "human_approved_documents": sum(is_approved_document(document) for document in approved_documents),
                "legacy_marked_documents": len(approved_legacy),
                "legacy_marked_documents_without_direct_legacy_url": sum(
                    not row["direct_legacy_urls"] for row in approved_legacy
                ),
                "documents_with_direct_legacy_url": len(direct_approved_ids),
                "direct_approved_capture_matches": sum(row["content_status"] == "used" for row in report_rows),
            },
            "cms_seed": {
                "records": len(seed_rows),
                "records_with_source_url": sum(bool(text(seed.get("source_url"))) for seed in seed_rows),
                "statuses": dict(sorted(seed_statuses.items())),
                "captured_seeded_for_review": sum(row["content_status"] == "seeded_for_review" for row in report_rows),
                "seeded_but_not_captured": sum(
                    bool(row["cms_seed_record_ids"]) and row["capture"]["state"] != "captured" for row in report_rows
                ),
            },
            "exact_mismatch": {
                "captured_without_direct_approved_cms_link": len(captured_without_direct_approved_link),
                "captured_seeded_for_review_not_public_usage": sum(
                    row["content_status"] == "seeded_for_review" for row in report_rows
                ),
                "captured_unlinked_unused": sum(row["content_status"] == "unused" for row in report_rows),
                "unresolved_non_listing_routes": len(unresolved_non_listing),
            },
        },
        "by_source_and_type": group_summaries(report_rows),
        "approved_cms_documents": sorted(approved_document_rows, key=lambda row: row["id"]),
        "safe_content_preservation_action": {
            "action": "Create a review-only import queue from rows with content_status=unused, preserving the legacy URL and text_sha256 as provenance.",
            "requires": [
                "A human reviewer must choose retain, rewrite, same-content redirect, or approved 410 for each unresolved legacy route.",
                "Any import must store the legacy URL and captured text_sha256, then remain draft/review-gated until approved.",
                "Robots-disallowed and 404 rows need a route decision, not a raw-content import.",
            ],
            "must_not": [
                "Do not publish raw extracted text.",
                "Do not treat cms_seed source_imported_review_required records as public content.",
                "Do not use homepage or search-page redirects as a fallback for unresolved URLs.",
            ],
        },
        "urls": report_rows,
    }
    return report


def markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    all_sources = summary["all_sources"]
    focus = summary["focus_source"]
    mismatch = summary["exact_mismatch"]
    approved = summary["approved_cms"]
    seed = summary["cms_seed"]
    lines = [
        "# Legacy Content Parity Report",
        "",
        f"Generated: `{report['generated_at_utc']}`",
        f"Focus source: `{focus['source_domain']}`",
        "",
        "## Decision",
        "",
        "Do not publish raw legacy text. The CMS seed is a review-only provenance link, not public usage; only an explicit approved-CMS legacy URL link counts as `used`.",
        "",
        "## Exact Mismatch",
        "",
        f"- Crawl inventory URLs: {all_sources['crawl_inventory_urls']}",
        f"- Captured text: {all_sources['captured']}",
        f"- Used through direct approved-CMS source links: {all_sources['used']}",
        f"- Seeded for review only: {all_sources['seeded_for_review']}",
        f"- Captured but unlinked/unused: {all_sources['unused']}",
        f"- Robots-disallowed: {all_sources['robots']}",
        f"- Capture-time 404: {all_sources['404']}",
        f"- Unavailable: {all_sources['unavailable']}",
        f"- Captured without a direct approved-CMS link: {mismatch['captured_without_direct_approved_cms_link']}",
        f"- Unresolved non-listing routes: {mismatch['unresolved_non_listing_routes']}",
        "",
        "## CMS Linkage",
        "",
        f"- Approved CMS documents: {approved['documents']} ({approved['human_approved_documents']} human-approved)",
        f"- Legacy-marked approved documents: {approved['legacy_marked_documents']}",
        f"- Legacy-marked documents without a direct legacy URL: {approved['legacy_marked_documents_without_direct_legacy_url']}",
        f"- Direct approved-CMS capture matches: {approved['direct_approved_capture_matches']}",
        f"- CMS seed records with source URLs: {seed['records_with_source_url']} ({seed['captured_seeded_for_review']} captured; {seed['seeded_but_not_captured']} unavailable at capture time)",
        "",
        "## Counts by Source and Type",
        "",
        "| Source | Type | Crawl | Used | Seeded for review | Unused | Robots | 404 | Unavailable | Route mapped | Route unresolved |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in report["by_source_and_type"]:
        lines.append(
            f"| {row['source_domain']} | {row['url_type']} | {row['crawl_inventory_urls']} | {row['used']} | "
            f"{row['seeded_for_review']} | {row['unused']} | {row['robots']} | {row['404']} | "
            f"{row['unavailable']} | {row['route_mapped']} | {row['route_unresolved']} |"
        )
    lines.extend(
        [
            "",
            "## Safe Content-Preservation Import",
            "",
            f"{report['safe_content_preservation_action']['action']}",
            "",
            "Required before any publication:",
            *[f"- {item}" for item in report["safe_content_preservation_action"]["requires"]],
            "",
            "Do not:",
            *[f"- {item}" for item in report["safe_content_preservation_action"]["must_not"]],
            "",
            "## Per-URL Audit",
            "",
            "Every joined URL and its capture, route, approved-CMS, and CMS-seed state is in `content-parity-report.json` under `urls`. Raw extracted body text is intentionally omitted from this report.",
            "",
        ]
    )
    return "\n".join(lines)


def write_report(report: dict[str, Any], output_json: Path, output_markdown: Path) -> None:
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_markdown.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(f"{json.dumps(report, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
    output_markdown.write_text(markdown(report), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit legacy content capture against routes and review-gated CMS provenance.")
    parser.add_argument("--crawl-inventory", type=Path, default=DEFAULT_CRAWL_INVENTORY)
    parser.add_argument("--evidence-dir", type=Path, default=DEFAULT_EVIDENCE_DIR)
    parser.add_argument("--route-map", type=Path, default=DEFAULT_ROUTE_MAP)
    parser.add_argument("--approved-cms-content", type=Path, default=DEFAULT_APPROVED_CMS_CONTENT)
    parser.add_argument("--cms-seed", type=Path, default=DEFAULT_CMS_SEED)
    parser.add_argument("--focus-source-domain", default=DEFAULT_FOCUS_SOURCE_DOMAIN)
    parser.add_argument("--output-json", type=Path, default=None)
    parser.add_argument("--output-markdown", type=Path, default=None)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = build_report(
        crawl_inventory_path=args.crawl_inventory,
        evidence_dir=args.evidence_dir,
        route_map_path=args.route_map,
        approved_cms_content_path=args.approved_cms_content,
        cms_seed_path=args.cms_seed,
        focus_source_domain=args.focus_source_domain,
    )
    output_json = args.output_json or args.evidence_dir / "content-parity-report.json"
    output_markdown = args.output_markdown or args.evidence_dir / "content-parity-report.md"
    write_report(report, output_json, output_markdown)
    summary = report["summary"]
    print(f"captured={summary['all_sources']['captured']}")
    print(f"used={summary['all_sources']['used']}")
    print(f"seeded_for_review={summary['all_sources']['seeded_for_review']}")
    print(f"unused={summary['all_sources']['unused']}")
    print(f"unresolved_non_listing_routes={summary['exact_mismatch']['unresolved_non_listing_routes']}")
    print(f"output_json={output_json}")
    print(f"output_markdown={output_markdown}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
