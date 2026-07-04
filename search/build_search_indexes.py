#!/usr/bin/env python3
"""Build lightweight search-import fixtures from the crawl metadata export.

The generated files are intentionally service-neutral. They let us validate the
listing corpus locally, then import the same records into Typesense or
Meilisearch without scraping the public sites again.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACT = ROOT / "migration" / "artifacts" / "20260704-211155"
OUT_DIR = ROOT / "search" / "data"


LOCATION_PATTERNS = [
    ("Sandanski", re.compile(r"\b(sandanski|сандански)\b", re.I)),
    ("Bansko", re.compile(r"\b(bansko|банско)\b", re.I)),
    ("Sveti Vlas", re.compile(r"\b(sveti[-\s]?vlas|свети\s+влас)\b", re.I)),
    ("Ofrinio", re.compile(r"\b(ofrinio|офринио)\b", re.I)),
    ("Blagoevgrad", re.compile(r"\b(blagoevgrad|благоевград)\b", re.I)),
    ("Melnik", re.compile(r"\b(melnik|мелник)\b", re.I)),
    ("Petrich", re.compile(r"\b(petrich|петрич)\b", re.I)),
    ("Kresna", re.compile(r"\b(kresna|кресна)\b", re.I)),
    ("Sofia", re.compile(r"\b(sofia|софия)\b", re.I)),
]

TYPE_PATTERNS = [
    ("apartment", re.compile(r"\b(apartment|flat|апартамент|квартира)\b", re.I)),
    ("house", re.compile(r"\b(house|villa|къща|вила|дом)\b", re.I)),
    ("land", re.compile(r"\b(land|plot|земя|парцел)\b", re.I)),
    ("commercial", re.compile(r"\b(office|shop|commercial|офис|магазин|търгов)\b", re.I)),
    ("hotel", re.compile(r"\b(hotel|хотел)\b", re.I)),
]


def textish(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def infer_location(text: str) -> str:
    for location, pattern in LOCATION_PATTERNS:
        if pattern.search(text):
            return location
    return ""


def infer_property_type(text: str) -> str:
    for kind, pattern in TYPE_PATTERNS:
        if pattern.search(text):
            return kind
    return "property"


def infer_language(domain: str, url: str) -> str:
    if domain.endswith(".ru"):
        return "ru"
    if "/en/" in url:
        return "en"
    if "/de/" in url:
        return "de"
    if "/nl/" in url:
        return "nl"
    return "bg"


def infer_offer(text: str) -> str:
    lowered = text.lower()
    if any(token in lowered for token in ("rent", "наем", "аренда")):
        return "rent"
    return "sale"


def infer_bedrooms(text: str) -> int | None:
    match = re.search(r"\b([1-6])\s*(?:bed|bedroom|bedrooms|стай|стаен|спал)", text, re.I)
    if match:
        return int(match.group(1))
    return None


def extract_reference(url: str, fallback: int) -> str:
    slug = unquote(urlparse(url).path.rstrip("/").split("/")[-1])
    ref_match = re.search(r"(?:^|[-_])(\d{3,7})(?:$|[-_])", slug)
    if ref_match:
        return f"MS-{ref_match.group(1)}"
    return f"MS-CRAWL-{fallback:04d}"


def load_listing_docs(artifact_dir: Path) -> list[dict[str, object]]:
    metadata_path = artifact_dir / "metadata-inventory.csv"
    if not metadata_path.exists():
        raise FileNotFoundError(f"Missing metadata export: {metadata_path}")

    csv.field_size_limit(sys.maxsize)
    docs: list[dict[str, object]] = []
    seen_urls: set[str] = set()

    with metadata_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row.get("url_type") != "listing":
                continue

            url = textish(row.get("url"))
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)

            title = textish(row.get("title")) or textish(row.get("h1")) or url
            description = textish(row.get("meta_description"))
            h1 = textish(row.get("h1"))
            domain = textish(row.get("source_domain"))
            combined = " ".join([title, description, h1, url])

            docs.append(
                {
                    "id": extract_reference(url, len(docs) + 1),
                    "url": url,
                    "canonical": textish(row.get("canonical")),
                    "domain": domain,
                    "language": infer_language(domain, url),
                    "title": title,
                    "description": description,
                    "h1": h1,
                    "location": infer_location(combined),
                    "property_type": infer_property_type(combined),
                    "offer_type": infer_offer(combined),
                    "bedrooms": infer_bedrooms(combined),
                    "price_eur": None,
                    "image_count": int(row.get("image_count") or 0),
                    "word_count": int(row.get("word_count") or 0),
                    "schema_present": row.get("schema_present") == "true",
                    "source_sitemap": textish(row.get("sitemap_source")),
                    "search_text": textish(" ".join([title, description, h1])),
                }
            )

    return docs


def write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def write_typesense_schema(path: Path) -> None:
    schema = {
        "name": "ms_realty_listings",
        "fields": [
            {"name": "id", "type": "string"},
            {"name": "url", "type": "string"},
            {"name": "domain", "type": "string", "facet": True},
            {"name": "language", "type": "string", "facet": True},
            {"name": "title", "type": "string"},
            {"name": "description", "type": "string", "optional": True},
            {"name": "location", "type": "string", "facet": True, "optional": True},
            {"name": "property_type", "type": "string", "facet": True},
            {"name": "offer_type", "type": "string", "facet": True},
            {"name": "bedrooms", "type": "int32", "facet": True, "optional": True},
            {"name": "image_count", "type": "int32"},
            {"name": "word_count", "type": "int32"},
            {"name": "search_text", "type": "string"},
        ],
        "default_sorting_field": "image_count",
    }
    write_json(path, schema)


def write_meili_settings(path: Path) -> None:
    settings = {
        "searchableAttributes": ["title", "description", "h1", "search_text", "location"],
        "filterableAttributes": ["domain", "language", "location", "property_type", "offer_type", "bedrooms"],
        "sortableAttributes": ["image_count", "word_count"],
        "displayedAttributes": ["*"],
        "rankingRules": ["words", "typo", "proximity", "attribute", "sort", "exactness"],
    }
    write_json(path, settings)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    docs = load_listing_docs(args.artifact_dir)
    if not docs:
        raise SystemExit(f"No listing records found in {args.artifact_dir}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    write_json(args.out_dir / "listings.json", docs)
    write_jsonl(args.out_dir / "typesense-listings.jsonl", docs)
    write_jsonl(args.out_dir / "meilisearch-listings.ndjson", docs)
    write_typesense_schema(args.out_dir / "typesense-schema.json")
    write_meili_settings(args.out_dir / "meilisearch-settings.json")

    summary = {
        "artifact_dir": str(args.artifact_dir),
        "listing_count": len(docs),
        "domains": sorted({str(doc["domain"]) for doc in docs}),
        "languages": sorted({str(doc["language"]) for doc in docs}),
        "locations": sorted({str(doc["location"]) for doc in docs if doc["location"]}),
    }
    write_json(args.out_dir / "search-fixture-summary.json", summary)
    print(f"Wrote {len(docs)} listing records to {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
