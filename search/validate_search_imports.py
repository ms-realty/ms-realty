#!/usr/bin/env python3
"""Validate local Typesense and Meilisearch import fixtures."""

from __future__ import annotations

import json
import re
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
    if kind == "string[]":
        return isinstance(value, list) and all(isinstance(item, str) for item in value)
    if kind == "bool":
        return isinstance(value, bool)
    if kind == "int32":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "float":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return False


def main() -> int:
    source_docs = load_json(DATA / "listings.json")
    index_docs = load_json(DATA / "index-listings.json")
    typesense_docs = load_jsonl(DATA / "typesense-listings.jsonl")
    meili_docs = load_jsonl(DATA / "meilisearch-listings.ndjson")
    schema = load_json(DATA / "typesense-schema.json")
    settings = load_json(DATA / "meilisearch-settings.json")
    meili_common_docs = [
        {key: value for key, value in document.items() if key != "meili_id"}
        for document in meili_docs
    ]

    if len(source_docs) != 165:
        raise SystemExit("Expected 165 source listing docs")
    if len(index_docs) != 165 or typesense_docs != index_docs or meili_common_docs != index_docs:
        raise SystemExit("Search import feeds must match the 165-document source index")

    ids = [doc["id"] for doc in index_docs]
    if len(ids) != len(set(ids)):
        raise SystemExit("Search index document ids must be unique")

    if any(
        doc.get("listing_reference") != doc.get("source_listing_id")
        or doc.get("location_label") != doc.get("location")
        or doc.get("publication_state") != "review_required"
        or doc.get("listing_status") != "unverified"
        or doc.get("locale_indexable") is not False
        for doc in index_docs
    ):
        raise SystemExit("Legacy search fixtures must expose the production query contract fail-closed")

    meili_ids = [str(doc.get("meili_id") or "") for doc in meili_docs]
    expected_meili_ids = [re.sub(r"[^A-Za-z0-9_-]", "_", doc_id) for doc_id in ids]
    if meili_ids != expected_meili_ids or len(meili_ids) != len(set(meili_ids)):
        raise SystemExit("Meilisearch primary keys must be safe, stable, and unique")

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

    if any(
        doc["search_document_type"] != "source"
        or doc["source_listing_id"] != source["id"]
        or doc["locale"] != source["locale"]
        or doc["translation_source_locale"] != source["locale"]
        or doc["translation_indexable"] is not True
        for doc, source in zip(index_docs, source_docs, strict=True)
    ):
        raise SystemExit("Search import must contain only indexable source-language documents")

    reviewed_source = next((doc for doc in source_docs if doc["id"] == "MS-00815"), None)
    if reviewed_source is None:
        raise SystemExit("Reviewed source listing is missing from search imports")
    reviewed_description = str(reviewed_source["description"])
    reviewed_docs = [doc for doc in index_docs if doc["source_listing_id"] == "MS-00815"]
    if {doc["locale"] for doc in reviewed_docs} != {"bg"}:
        raise SystemExit("Reviewed listing must export only its Bulgarian source search document")
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
        "MS-00815": "commercial",
        "MS-00907": "multi_unit",
        "MS-00443": "commercial",
        "MS-00567-1": "multi_unit",
        "MS-00812": "commercial",
        "MS-00456": "commercial",
        "MS-00444": "commercial",
        "MS-CRAWL-0151": "commercial",
        "MS-00945": "land",
        "MS-00046": "land",
    }
    for listing_id, property_type in expected_types.items():
        if property_types.get(listing_id) != property_type:
            raise SystemExit(f"Search imports must classify {listing_id} as {property_type}")

    bedrooms = {doc["id"]: doc["bedrooms"] for doc in source_docs}
    expected_bedrooms = {
        "MS-00922": 2,
        "MS-00911": 1,
        "MS-00903": 0,
    }
    for listing_id, bedroom_count in expected_bedrooms.items():
        if bedrooms.get(listing_id) != bedroom_count:
            raise SystemExit(f"Search imports must infer {bedroom_count} bedrooms for {listing_id}")

    russian_listing = next(doc for doc in source_docs if doc["id"] == "MS-CRAWL-0114")
    if "apartamenty" not in str(russian_listing["search_text"]).lower():
        raise SystemExit("Search imports must include deterministic Cyrillic transliteration variants")

    reviewed_locations = {doc["id"]: doc for doc in source_docs}
    if reviewed_locations["MS-00865"]["location"] != "Polenitsa" or reviewed_locations["MS-00865"]["settlement_ekatte"] != "57176":
        raise SystemExit("Search imports must use reviewed official settlement data")
    if reviewed_locations["MS-00865"]["district"] != "Blagoevgrad" or reviewed_locations["MS-00865"]["district_code"] != "BLG":
        raise SystemExit("Search imports must derive the reviewed official Bulgarian district")
    if "district" not in settings["filterableAttributes"] or "district_code" not in settings["filterableAttributes"]:
        raise SystemExit("Search imports must expose reviewed Bulgarian districts as engine facets")
    if reviewed_locations["MS-00930"]["location"] != "Logari" or reviewed_locations["MS-00930"]["country_code"] != "GR":
        raise SystemExit("Search imports must not label Greek listings as Sandanski")
    if reviewed_locations["MS-00930"]["geography_id"] != "GR:settlement:EL52:1202020404":
        raise SystemExit("Search imports must anchor Logari to the official Greek settlement")
    if "GR:region:EL52" not in reviewed_locations["MS-00930"]["geography_path"]:
        raise SystemExit("Search imports must preserve official Greek region ancestry")
    if reviewed_locations["MS-00100"]["geography_id"] != "GR:municipality:EL52:1303":
        raise SystemExit("Imprecise Elani-Sani source content must remain municipality-anchored")
    if reviewed_locations["MS-00987"]["location_precision"] != "approximate":
        raise SystemExit("Kotroni must remain a locality label anchored to official Eretria")
    if "geography_path" not in settings["filterableAttributes"]:
        raise SystemExit("Search imports must expose official geography ancestry as an engine facet")
    if reviewed_locations["MS-CRAWL-0143"]["location_review_status"] != "legacy_area_only":
        raise SystemExit("Route mentions must remain location-review holds")

    print("PASS: search import fixtures validate for Typesense and Meilisearch")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
