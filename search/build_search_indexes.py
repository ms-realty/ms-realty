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
LOCALE_REGISTRY = ROOT / "locales" / "registry.json"
LISTING_EDITS_LEDGER = ROOT / "production" / "data" / "listing-edits.jsonl"


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
    ("apartment", re.compile(r"\b(apartment|flat|апартамент\w*|квартир\w*|мезонет\w*|студио)\b", re.I)),
    ("house", re.compile(r"\b(house|villa|къщ\w*|вил\w*|дом)\b", re.I)),
    ("land", re.compile(r"\b(land|plot|земя|парцел\w*|участок\w*)\b", re.I)),
    ("commercial", re.compile(r"\b(office|shop|business|commercial|industrial|industrieel|офис\w*|магазин\w*|бизнес\w*|търгов\w*|производ\w*|помещение|оранжери\w*|теплиц\w*|промишлен\w*|промышленн\w*|работилница|бензиностанц\w*)\b", re.I)),
    ("hotel", re.compile(r"\b(hotel|хотел)\b", re.I)),
]

APPROVED_TRANSLATION_SEEDS = {"MS-CRAWL-0001": ["el", "he"]}
PUBLIC_TRANSLATION_STATES = {"approved", "published"}


def textish(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def infer_location(text: str) -> str:
    for location, pattern in LOCATION_PATTERNS:
        if pattern.search(text):
            return location
    return ""


def infer_property_type(text: str) -> str:
    matches = [(match.start(), index, kind) for index, (kind, pattern) in enumerate(TYPE_PATTERNS) if (match := pattern.search(text))]
    return min(matches)[2] if matches else "property"


def load_locale_registry(path: Path = LOCALE_REGISTRY) -> dict[str, object]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_listing_edits(path: Path = LISTING_EDITS_LEDGER) -> list[dict[str, object]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def public_indexable_locales(registry: dict[str, object]) -> set[str]:
    return {
        str(locale["code"])
        for locale in registry.get("locales", [])
        if locale.get("public_enabled") and locale.get("indexable")
    }


def locales_by_code(registry: dict[str, object]) -> dict[str, dict[str, object]]:
    return {str(locale["code"]): locale for locale in registry.get("locales", [])}


def listing_path(registry: dict[str, object], locale: str, listing_id: str) -> str:
    locale_row = locales_by_code(registry)[locale]
    return f"/{locale}/{locale_row['route_segments']['listing']}/{listing_id}"


def infer_language(domain: str, url: str, registry: dict[str, object] | None = None) -> str:
    if domain.endswith(".ru"):
        return "ru"
    codes = [str(locale["code"]) for locale in (registry or {}).get("locales", [])]
    for code in sorted(codes, key=len, reverse=True):
        if f"/{code}/" in url:
            return code
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
    lowered = text.lower()
    word_match = re.search(r"\b(една|две|три|четири|пет|шест)\s+(?:спални|спальни)", lowered, re.I)
    if word_match:
        return {"една": 1, "две": 2, "три": 3, "четири": 4, "пет": 5, "шест": 6}[word_match.group(1)]
    for token, bedrooms in (("студио", 0), ("едностаен", 0), ("двустаен", 1), ("тристаен", 2), ("четиристаен", 3)):
        if token in lowered:
            return bedrooms
    return None


def extract_reference(url: str, fallback: int) -> str:
    slug = unquote(urlparse(url).path.rstrip("/").split("/")[-1])
    ref_match = re.search(r"(?:^|[-_])(\d{3,7})(?:$|[-_])", slug)
    if ref_match:
        return f"MS-{ref_match.group(1)}"
    return f"MS-CRAWL-{fallback:04d}"


def translation_indexable(status: str, human_approved: bool, locale: str, registry: dict[str, object]) -> bool:
    return locale in public_indexable_locales(registry) and status in PUBLIC_TRANSLATION_STATES and human_approved


def source_index_doc(doc: dict[str, object], registry: dict[str, object]) -> dict[str, object]:
    locale = str(doc["locale"])
    status = str(doc["translation_status"])
    human_approved = status == "published"
    listing_id = str(doc["id"])
    return {
        **doc,
        "id": f"{listing_id}:{locale}",
        "source_listing_id": listing_id,
        "search_document_type": "source",
        "locale_path": listing_path(registry, locale, listing_id),
        "translation_source_locale": locale,
        "translation_human_approved": human_approved,
        "translation_indexable": translation_indexable(status, human_approved, locale, registry),
    }


def approved_translation_index_doc(doc: dict[str, object], locale: str, registry: dict[str, object]) -> dict[str, object]:
    listing_id = str(doc["id"])
    source_locale = str(doc["locale"])
    return {
        **doc,
        "id": f"{listing_id}:{locale}",
        "source_listing_id": listing_id,
        "search_document_type": "approved_translation",
        "language": locale,
        "locale": locale,
        "locale_prefix": f"/{locale}/",
        "locale_is_indexable": locale in public_indexable_locales(registry),
        "locale_path": listing_path(registry, locale, listing_id),
        "translation_status": "approved",
        "translation_source_locale": source_locale,
        "translation_human_approved": True,
        "translation_indexable": translation_indexable("approved", True, locale, registry),
    }


def build_index_docs(source_docs: list[dict[str, object]], registry: dict[str, object]) -> list[dict[str, object]]:
    index_docs: list[dict[str, object]] = []
    by_id = {str(doc["id"]): doc for doc in source_docs}

    for doc in source_docs:
        index_docs.append(source_index_doc(doc, registry))

    for listing_id, locales in APPROVED_TRANSLATION_SEEDS.items():
        source = by_id.get(listing_id)
        if not source:
            continue
        for locale in locales:
            if locale not in public_indexable_locales(registry):
                continue
            index_docs.append(approved_translation_index_doc(source, locale, registry))

    return index_docs


def apply_listing_edits(docs: list[dict[str, object]], edits: list[dict[str, object]]) -> list[dict[str, object]]:
    patches: dict[str, dict[str, object]] = {}
    for edit in edits:
        listing_id = str(edit.get("listing_id") or "")
        patch = edit.get("patch")
        if listing_id and isinstance(patch, dict):
            patches[listing_id] = {**patches.get(listing_id, {}), **patch}

    if not patches:
        return docs

    for doc in docs:
        patch = patches.get(str(doc["id"]))
        if not patch:
            continue
        for field in ("title", "description", "h1", "location", "property_type", "offer_type", "bedrooms", "price_eur"):
            if field in patch:
                doc[field] = patch[field]
        doc["search_text"] = textish(
            " ".join([str(doc.get("title") or ""), str(doc.get("description") or ""), str(doc.get("h1") or "")])
        )
    return docs


def load_listing_docs(artifact_dir: Path, registry: dict[str, object]) -> list[dict[str, object]]:
    metadata_path = artifact_dir / "metadata-inventory.csv"
    if not metadata_path.exists():
        raise FileNotFoundError(f"Missing metadata export: {metadata_path}")

    csv.field_size_limit(sys.maxsize)
    docs: list[dict[str, object]] = []
    seen_urls: set[str] = set()
    indexable_locales = public_indexable_locales(registry)

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
            type_text = " ".join([title, h1, url])
            locale = infer_language(domain, url, registry)
            locale_is_indexable = locale in indexable_locales

            docs.append(
                {
                    "id": extract_reference(url, len(docs) + 1),
                    "url": url,
                    "canonical": textish(row.get("canonical")),
                    "domain": domain,
                    "language": locale,
                    "locale": locale,
                    "locale_prefix": f"/{locale}/",
                    "locale_is_indexable": locale_is_indexable,
                    "translation_status": "published" if locale_is_indexable else "fallback",
                    "title": title,
                    "description": description,
                    "h1": h1,
                    "location": infer_location(combined),
                    "property_type": infer_property_type(type_text),
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
            {"name": "source_listing_id", "type": "string", "facet": True},
            {"name": "search_document_type", "type": "string", "facet": True},
            {"name": "url", "type": "string"},
            {"name": "domain", "type": "string", "facet": True},
            {"name": "language", "type": "string", "facet": True},
            {"name": "locale", "type": "string", "facet": True},
            {"name": "locale_prefix", "type": "string", "facet": True},
            {"name": "locale_path", "type": "string"},
            {"name": "locale_is_indexable", "type": "bool", "facet": True},
            {"name": "translation_status", "type": "string", "facet": True},
            {"name": "translation_source_locale", "type": "string", "facet": True},
            {"name": "translation_human_approved", "type": "bool", "facet": True},
            {"name": "translation_indexable", "type": "bool", "facet": True},
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
        "filterableAttributes": [
            "source_listing_id",
            "search_document_type",
            "domain",
            "language",
            "locale",
            "locale_prefix",
            "locale_path",
            "locale_is_indexable",
            "translation_status",
            "translation_source_locale",
            "translation_human_approved",
            "translation_indexable",
            "location",
            "property_type",
            "offer_type",
            "bedrooms",
        ],
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

    registry = load_locale_registry()
    listing_edits = load_listing_edits()
    source_docs = apply_listing_edits(load_listing_docs(args.artifact_dir, registry), listing_edits)
    if not source_docs:
        raise SystemExit(f"No listing records found in {args.artifact_dir}")
    index_docs = build_index_docs(source_docs, registry)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    write_json(args.out_dir / "listings.json", source_docs)
    write_json(args.out_dir / "index-listings.json", index_docs)
    write_jsonl(args.out_dir / "typesense-listings.jsonl", index_docs)
    write_jsonl(args.out_dir / "meilisearch-listings.ndjson", index_docs)
    write_typesense_schema(args.out_dir / "typesense-schema.json")
    write_meili_settings(args.out_dir / "meilisearch-settings.json")

    summary = {
        "artifact_dir": str(args.artifact_dir),
        "source_listing_count": len(source_docs),
        "index_document_count": len(index_docs),
        "domains": sorted({str(doc["domain"]) for doc in source_docs}),
        "source_languages": sorted({str(doc["language"]) for doc in source_docs}),
        "index_languages": sorted({str(doc["language"]) for doc in index_docs}),
        "admin_locales": registry.get("admin_locales", []),
        "public_indexable_locales": sorted(public_indexable_locales(registry)),
        "listing_edit_count": len(listing_edits),
        "url_strategy": registry.get("url_strategy"),
        "locations": sorted({str(doc["location"]) for doc in source_docs if doc["location"]}),
    }
    write_json(args.out_dir / "search-fixture-summary.json", summary)
    print(f"Wrote {len(source_docs)} source listing records and {len(index_docs)} search index documents to {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
