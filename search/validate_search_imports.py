#!/usr/bin/env python3
"""Validate local Typesense and Meilisearch import fixtures."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "search" / "data"


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def field_ok(value: object, field: dict[str, object]) -> bool:
    if value is None and field.get("optional"):
        return True
    kind = field["type"]
    if kind == "string":
        return isinstance(value, str)
    if kind == "bool":
        return isinstance(value, bool)
    if kind == "int32":
        return isinstance(value, int) and not isinstance(value, bool)
    return False


def main() -> int:
    source_docs = load_json(DATA / "listings.json")
    index_docs = load_json(DATA / "index-listings.json")
    typesense_docs = load_jsonl(DATA / "typesense-listings.jsonl")
    meili_docs = load_jsonl(DATA / "meilisearch-listings.ndjson")
    schema = load_json(DATA / "typesense-schema.json")
    settings = load_json(DATA / "meilisearch-settings.json")

    if len(source_docs) != 165:
        raise SystemExit("Expected 165 source listing docs")
    if len(index_docs) != 167 or typesense_docs != index_docs or meili_docs != index_docs:
        raise SystemExit("Search import feeds must match the 167-document locale index")

    ids = [doc["id"] for doc in index_docs]
    if len(ids) != len(set(ids)):
        raise SystemExit("Search index document ids must be unique")

    fields = {field["name"]: field for field in schema["fields"]}
    for doc in typesense_docs:
        for name, field in fields.items():
            if name not in doc:
                if field.get("optional"):
                    continue
                raise SystemExit(f"Typesense doc {doc['id']} missing {name}")
            if not field_ok(doc[name], field):
                raise SystemExit(f"Typesense doc {doc['id']} has invalid {name}")

    for attr in settings["filterableAttributes"]:
        if attr not in fields:
            raise SystemExit(f"Meilisearch filterable attribute not in Typesense schema: {attr}")

    approved = [doc for doc in index_docs if doc["search_document_type"] == "approved_translation"]
    if {(doc["source_listing_id"], doc["locale"]) for doc in approved} != {("MS-CRAWL-0001", "el"), ("MS-CRAWL-0001", "he")}:
        raise SystemExit("Expected only approved Greek and Hebrew translation search docs")
    if any(doc["locale"] == "fr" or doc["translation_indexable"] is not True for doc in index_docs):
        raise SystemExit("Search import must exclude French and non-indexable docs")

    reviewed_description = "Updated approved source description."
    reviewed_docs = [doc for doc in index_docs if doc["source_listing_id"] == "MS-CRAWL-0001"]
    if {doc["locale"] for doc in reviewed_docs} != {"bg", "el", "he"}:
        raise SystemExit("Reviewed listing must export BG source plus Greek and Hebrew search docs")
    if any(doc["description"] != reviewed_description or reviewed_description not in doc["search_text"] for doc in reviewed_docs):
        raise SystemExit("Search imports must apply reviewed CMS listing edits before export")
    if any(not str(doc.get("thumbnail_url") or "").startswith("https://") for doc in reviewed_docs):
        raise SystemExit("Search imports must carry reviewed public listing thumbnails")
    if any("/wp-content/uploads/" not in str(doc.get("thumbnail_url") or "") for doc in reviewed_docs):
        raise SystemExit("Search thumbnails must come from uploaded property media")
    if any(not doc.get("thumbnail_alt") for doc in reviewed_docs):
        raise SystemExit("Search thumbnails must carry alt text")

    property_types = {doc["id"]: doc["property_type"] for doc in source_docs}
    expected_types = {
        "MS-CRAWL-0001": "commercial",
        "MS-CRAWL-0002": "multi_unit",
        "MS-CRAWL-0006": "commercial",
        "MS-CRAWL-0013": "multi_unit",
        "MS-CRAWL-0019": "commercial",
        "MS-CRAWL-0070": "commercial",
        "MS-CRAWL-0111": "commercial",
        "MS-CRAWL-0151": "commercial",
        "MS-CRAWL-0059": "land",
        "MS-CRAWL-0158": "land",
    }
    for listing_id, property_type in expected_types.items():
        if property_types.get(listing_id) != property_type:
            raise SystemExit(f"Search imports must classify {listing_id} as {property_type}")

    bedrooms = {doc["id"]: doc["bedrooms"] for doc in source_docs}
    expected_bedrooms = {
        "MS-CRAWL-0003": 2,
        "MS-CRAWL-0007": 1,
        "MS-CRAWL-0029": 0,
    }
    for listing_id, bedroom_count in expected_bedrooms.items():
        if bedrooms.get(listing_id) != bedroom_count:
            raise SystemExit(f"Search imports must infer {bedroom_count} bedrooms for {listing_id}")

    print("PASS: search import fixtures validate for Typesense and Meilisearch")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
