#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path

try:
    from migration.crawl_inventory import fetch
except ModuleNotFoundError:
    from crawl_inventory import fetch


METADATA_FIELDS = (
    "status",
    "final_url",
    "title",
    "meta_description",
    "canonical",
    "robots_meta",
    "hreflang",
    "h1",
    "word_count",
    "image_count",
    "schema_present",
)


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or "url" not in reader.fieldnames:
            raise ValueError(f"Crawl CSV must include a url column: {path}")
        return list(reader)


def rows_by_url(rows: list[dict[str, str]], label: str) -> dict[str, dict[str, str]]:
    indexed: dict[str, dict[str, str]] = {}
    for row in rows:
        url = str(row.get("url", "")).strip()
        if not url:
            raise ValueError(f"{label} includes an empty URL")
        if url in indexed:
            raise ValueError(f"{label} includes a duplicate URL: {url}")
        indexed[url] = row
    return indexed


def read_artifact(artifact_dir: Path) -> dict[str, dict[str, dict[str, str]]]:
    url_rows = rows_by_url(read_csv_rows(artifact_dir / "url-inventory.csv"), "url inventory")
    metadata_rows = rows_by_url(read_csv_rows(artifact_dir / "metadata-inventory.csv"), "metadata inventory")
    if set(url_rows) != set(metadata_rows):
        raise ValueError(f"URL and metadata inventories disagree in {artifact_dir}")
    return {"urls": url_rows, "metadata": metadata_rows}


def status_failures(rows: dict[str, dict[str, str]]) -> list[dict[str, str]]:
    failures = []
    for url, row in rows.items():
        try:
            status = int(row.get("status", "0") or 0)
        except ValueError:
            status = 0
        if status < 200 or status >= 400 or row.get("error"):
            failures.append(
                {
                    "url": url,
                    "status": str(status or "n/a"),
                    "error": row.get("error", ""),
                }
            )
    return failures


def probe_removed_urls(urls: list[str], timeout: int) -> list[dict[str, str]]:
    probes = []
    for url in urls:
        result = fetch(url, timeout=timeout)
        probes.append(
            {
                "url": url,
                "status": str(result.status or "n/a"),
                "final_url": result.final_url or "",
                "error": result.error or "",
            }
        )
    return probes


def build_delta(
    baseline_dir: Path,
    current_dir: Path,
    *,
    probe_removed: bool = False,
    timeout: int = 25,
) -> dict[str, object]:
    baseline = read_artifact(baseline_dir)
    current = read_artifact(current_dir)
    baseline_urls = set(baseline["urls"])
    current_urls = set(current["urls"])
    removed_urls = sorted(baseline_urls - current_urls)
    added_urls = sorted(current_urls - baseline_urls)
    shared_urls = sorted(baseline_urls & current_urls)

    change_counts: Counter[str] = Counter()
    status_changes = []
    for url in shared_urls:
        before = baseline["metadata"][url]
        after = current["metadata"][url]
        changed = [field for field in METADATA_FIELDS if str(before.get(field, "")) != str(after.get(field, ""))]
        change_counts.update(changed)
        if "status" in changed:
            status_changes.append(
                {
                    "url": url,
                    "before": before.get("status", ""),
                    "after": after.get("status", ""),
                }
            )

    failures = status_failures(current["metadata"])
    blockers = []
    if removed_urls:
        blockers.append(f"{len(removed_urls)} baseline URL(s) disappeared from the current sitemap")
    if failures:
        blockers.append(f"{len(failures)} current URL(s) failed or returned a 4xx/5xx status")
    if status_changes:
        blockers.append(f"{len(status_changes)} shared URL(s) changed HTTP status")

    return {
        "baseline_artifact": baseline_dir.name,
        "current_artifact": current_dir.name,
        "baseline_urls": len(baseline_urls),
        "current_urls": len(current_urls),
        "baseline_domains": dict(sorted(Counter(row["source_domain"] for row in baseline["urls"].values()).items())),
        "current_domains": dict(sorted(Counter(row["source_domain"] for row in current["urls"].values()).items())),
        "removed_urls": removed_urls,
        "added_urls": added_urls,
        "current_failures": failures,
        "status_changes": status_changes,
        "metadata_change_counts": {field: change_counts[field] for field in METADATA_FIELDS},
        "removed_url_probes": probe_removed_urls(removed_urls, timeout) if probe_removed else [],
        "promotion_blockers": blockers,
        "promotion_safe": not blockers,
    }


def markdown(delta: dict[str, object]) -> str:
    lines = [
        "# Crawl Delta",
        "",
        f"- Baseline artifact: `{delta['baseline_artifact']}`",
        f"- Current artifact: `{delta['current_artifact']}`",
        f"- Baseline URLs: {delta['baseline_urls']}",
        f"- Current URLs: {delta['current_urls']}",
        f"- Baseline domains: {', '.join(f'{domain}={count}' for domain, count in delta['baseline_domains'].items())}",
        f"- Current domains: {', '.join(f'{domain}={count}' for domain, count in delta['current_domains'].items())}",
        "",
        "## Promotion Decision",
        "",
    ]
    if delta["promotion_safe"]:
        lines.append("The current artifact has no removal, fetch-failure, or HTTP-status blocker.")
    else:
        lines.append("Do not replace the launch baseline automatically. Human review is required:")
        lines.extend(f"- {blocker}" for blocker in delta["promotion_blockers"])
    lines.extend(
        [
            "",
            "This comparison never authorizes a homepage/search redirect. Each removed URL needs a reviewed same-content mapping or an approved 410.",
            "",
            "## Removed URLs",
            "",
        ]
    )
    if delta["removed_urls"]:
        lines.extend(f"- {url}" for url in delta["removed_urls"])
    else:
        lines.append("- None")
    if delta["removed_url_probes"]:
        lines.extend(["", "## Removed URL Probes", ""])
        for probe in delta["removed_url_probes"]:
            suffix = f"; error={probe['error']}" if probe["error"] else ""
            final = f"; final_url={probe['final_url']}" if probe["final_url"] else ""
            lines.append(f"- {probe['url']} :: status={probe['status']}{final}{suffix}")
    lines.extend(["", "## Added URLs", ""])
    if delta["added_urls"]:
        lines.extend(f"- {url}" for url in delta["added_urls"])
    else:
        lines.append("- None")
    lines.extend(["", "## Current Failures", ""])
    if delta["current_failures"]:
        for failure in delta["current_failures"]:
            suffix = f"; error={failure['error']}" if failure["error"] else ""
            lines.append(f"- {failure['url']} :: status={failure['status']}{suffix}")
    else:
        lines.append("- None")
    lines.extend(["", "## Metadata Drift On Shared URLs", ""])
    for field, count in delta["metadata_change_counts"].items():
        lines.append(f"- {field}: {count}")
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare two MS Realty crawl artifacts without changing the launch baseline.")
    parser.add_argument("--baseline", type=Path, required=True, help="Existing authoritative crawl artifact directory.")
    parser.add_argument("--current", type=Path, required=True, help="Fresh crawl artifact directory to compare.")
    parser.add_argument("--output", type=Path, default=None, help="Markdown output path. Defaults to <current>/crawl-delta.md.")
    parser.add_argument("--probe-removed", action="store_true", help="Fetch URLs missing from the new sitemap and record their current status.")
    parser.add_argument("--timeout", type=int, default=25, help="Per-probe timeout in seconds.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = args.output or args.current / "crawl-delta.md"
    delta = build_delta(args.baseline, args.current, probe_removed=args.probe_removed, timeout=args.timeout)
    output.write_text(markdown(delta), encoding="utf-8")
    print(f"baseline_urls={delta['baseline_urls']}")
    print(f"current_urls={delta['current_urls']}")
    print(f"promotion_safe={'yes' if delta['promotion_safe'] else 'no'}")
    print(f"output={output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
