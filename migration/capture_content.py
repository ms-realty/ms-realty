#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

try:
    from migration.crawl_inventory import DEFAULT_TIMEOUT, PageParser, USER_AGENT, fetch, write_csv
except ModuleNotFoundError:
    from crawl_inventory import DEFAULT_TIMEOUT, PageParser, USER_AGENT, fetch, write_csv


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_INVENTORY = ROOT / "migration" / "artifacts" / "20260704-211155" / "url-inventory.csv"
DEFAULT_WORKERS = 2
EXTRACTOR = "html-primary-content-v1"


@dataclass(frozen=True)
class RobotsPolicy:
    robots_url: str
    status: int
    parser: RobotFileParser | None = None
    error: str = ""


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_url_inventory(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        required = {"source_domain", "url", "url_type"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"Source inventory must include {sorted(required)}: {path}")
        rows = [dict(row) for row in reader if str(row.get("url", "")).strip()]
    return sorted(rows, key=lambda row: (row["source_domain"], row["url"]))


def policy_key(row: dict[str, str]) -> tuple[str, str]:
    parsed = urlparse(row["url"])
    return parsed.scheme or "https", parsed.netloc.lower()


def load_robots_policy(scheme: str, host: str, timeout: int) -> RobotsPolicy:
    robots_url = f"{scheme}://{host}/robots.txt"
    result = fetch(robots_url, timeout=timeout)
    if result.error or result.status < 200 or result.status >= 400 or not result.body:
        detail = result.error or f"HTTP {result.status or 'n/a'}"
        return RobotsPolicy(robots_url=robots_url, status=result.status, error=detail)
    parser = RobotFileParser()
    parser.set_url(robots_url)
    parser.parse(result.body.splitlines())
    return RobotsPolicy(robots_url=robots_url, status=result.status, parser=parser)


def content_skip(row: dict[str, str], reason: str, detail: str = "", *, status: int = 0, final_url: str = "") -> dict[str, object]:
    return {
        "source_domain": row["source_domain"],
        "url": row["url"],
        "url_type": row["url_type"],
        "status": status,
        "final_url": final_url,
        "reason": reason,
        "detail": detail,
    }


def capture_page(row: dict[str, str], policy: RobotsPolicy, timeout: int, captured_at_utc: str) -> tuple[dict[str, object] | None, dict[str, object] | None]:
    if policy.error or policy.parser is None:
        return None, content_skip(row, "robots_unavailable", policy.error or policy.robots_url, status=policy.status)
    if not policy.parser.can_fetch(USER_AGENT, row["url"]):
        return None, content_skip(row, "robots_disallowed", policy.robots_url, status=policy.status)

    result = fetch(row["url"], timeout=timeout)
    if result.error or result.status < 200 or result.status >= 400:
        return None, content_skip(row, "fetch_failed", result.error, status=result.status, final_url=result.final_url)
    if "html" not in result.content_type.lower():
        return None, content_skip(row, "non_html", result.content_type, status=result.status, final_url=result.final_url)

    parser = PageParser(result.final_url or row["url"])
    parser.feed(result.body)
    parsed = parser.record()
    content_text = str(parsed["content_text"])
    if not content_text:
        return None, content_skip(row, "empty_extraction", str(parsed["content_scope"]), status=result.status, final_url=result.final_url)

    return {
        "source_domain": row["source_domain"],
        "url": row["url"],
        "url_type": row["url_type"],
        "status": result.status,
        "final_url": result.final_url,
        "content_type": result.content_type,
        "captured_at_utc": captured_at_utc,
        "extractor": EXTRACTOR,
        "content_scope": parsed["content_scope"],
        "content_word_count": parsed["content_word_count"],
        "extracted_body_text": content_text,
        "text_sha256": parsed["content_sha256"],
        "response_sha256": sha256_text(result.body),
    }, None


def capture_inventory(rows: list[dict[str, str]], timeout: int, workers: int, captured_at_utc: str) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[tuple[str, str], RobotsPolicy]]:
    policies = {key: load_robots_policy(*key, timeout) for key in sorted({policy_key(row) for row in rows})}
    contents: list[dict[str, object]] = []
    skipped: list[dict[str, object]] = []

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = [
            pool.submit(capture_page, row, policies[policy_key(row)], timeout, captured_at_utc)
            for row in rows
        ]
        for future in as_completed(futures):
            content, skip = future.result()
            if content:
                contents.append(content)
            if skip:
                skipped.append(skip)

    contents.sort(key=lambda row: (str(row["source_domain"]), str(row["url"])))
    skipped.sort(key=lambda row: (str(row["source_domain"]), str(row["url"])))
    if len(contents) + len(skipped) != len(rows):
        raise RuntimeError("Every source URL must result in one content record or explicit skip")
    return contents, skipped, policies


def prepare_output_dir(path: Path) -> None:
    if path.exists() and any(path.iterdir()):
        raise FileExistsError(f"Refusing to overwrite non-empty evidence directory: {path}")
    path.mkdir(parents=True, exist_ok=True)


def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            handle.write("\n")


def write_evidence(output_dir: Path, source_inventory: Path, contents: list[dict[str, object]], skipped: list[dict[str, object]], policies: dict[tuple[str, str], RobotsPolicy], captured_at_utc: str) -> dict[str, object]:
    content_path = output_dir / "content-inventory.jsonl"
    skipped_path = output_dir / "content-capture-skipped.csv"
    write_jsonl(content_path, contents)
    write_csv(
        skipped_path,
        skipped,
        ["source_domain", "url", "url_type", "status", "final_url", "reason", "detail"],
    )
    manifest = {
        "schema_version": 1,
        "artifact_id": output_dir.name,
        "captured_at_utc": captured_at_utc,
        "extractor": EXTRACTOR,
        "source_inventory": {
            "path": str(source_inventory),
            "sha256": sha256_file(source_inventory),
        },
        "counts": {
            "source_urls": len(contents) + len(skipped),
            "captured": len(contents),
            "skipped": len(skipped),
        },
        "robots": [
            {
                "host": host,
                "robots_url": policy.robots_url,
                "status": policy.status,
                "error": policy.error,
            }
            for (_, host), policy in sorted(policies.items())
        ],
        "files": {
            content_path.name: {"sha256": sha256_file(content_path), "rows": len(contents)},
            skipped_path.name: {"sha256": sha256_file(skipped_path), "rows": len(skipped)},
        },
    }
    (output_dir / "content-evidence-manifest.json").write_text(
        f"{json.dumps(manifest, ensure_ascii=False, indent=2)}\n",
        encoding="utf-8",
    )
    return manifest


def default_output_dir() -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return ROOT / "migration" / "content-evidence" / stamp


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture robots-respecting legacy page text as migration-review evidence.")
    parser.add_argument("--source-inventory", type=Path, default=DEFAULT_SOURCE_INVENTORY)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=0, help="Limit source URLs after inventory loading.")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Concurrent page fetches; defaults to a conservative 2.")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="Per-request timeout seconds.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = read_url_inventory(args.source_inventory)
    if args.limit:
        rows = rows[:args.limit]
    output_dir = args.output_dir or default_output_dir()
    prepare_output_dir(output_dir)
    captured_at_utc = datetime.now(timezone.utc).isoformat(timespec="seconds")
    contents, skipped, policies = capture_inventory(rows, args.timeout, args.workers, captured_at_utc)
    manifest = write_evidence(output_dir, args.source_inventory, contents, skipped, policies, captured_at_utc)
    print(f"source_urls={manifest['counts']['source_urls']}")
    print(f"captured={manifest['counts']['captured']}")
    print(f"skipped={manifest['counts']['skipped']}")
    print(f"output_dir={output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
