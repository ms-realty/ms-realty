#!/usr/bin/env python3
"""Build lightweight search-import fixtures from the crawl metadata export.

The generated files are intentionally service-neutral. They let us validate the
listing corpus locally, then import the same records into Typesense or
Meilisearch without scraping the public sites again.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACT = ROOT / "migration" / "artifacts" / "20260704-211155"
OUT_DIR = ROOT / "search" / "data"
LOCALE_REGISTRY = ROOT / "locales" / "registry.json"
LISTING_EDITS_LEDGER = ROOT / "production" / "data" / "listing-edits.jsonl"
LOCATION_REVIEWS = ROOT / "production" / "data" / "location-reviews.json"
GEOGRAPHY_REGISTRY = ROOT / "production" / "data" / "geography-registry.json"


def repo_relative_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


TYPE_PATTERNS = [
    ("apartment", re.compile(r"\b(apartment|flat|апартамент\w*|квартир\w*|мезонет\w*|студио)\b", re.I)),
    ("house", re.compile(r"\b(house|villa|къщ\w*|вил\w*|дом)\b", re.I)),
    ("land", re.compile(r"\b(land|plot|земя|парцел\w*|участок\w*)\b", re.I)),
    ("commercial", re.compile(r"\b(office|shop|business|commercial|industrial|industrieel|офис\w*|магазин\w*|бизнес\w*|търгов\w*|производ\w*|помещение|оранжери\w*|теплиц\w*|промишлен\w*|промышленн\w*|работилница|бензиностанц\w*)\b", re.I)),
    ("hotel", re.compile(r"\b(hotel|хотел)\b", re.I)),
]

APPROVED_TRANSLATION_SEEDS = {"MS-CRAWL-0001": ["el", "he"]}
PUBLIC_TRANSLATION_STATES = {"approved", "published"}

CYRILLIC_TO_LATIN = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sht", "ъ": "a",
    "ы": "y", "ь": "y", "э": "e", "ю": "yu", "я": "ya", "ѝ": "i",
}


def textish(value: str | None) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def search_text(*values: object) -> str:
    """Keep source text and deterministic Latin variants for cross-keyboard search."""
    source = textish(" ".join(str(value or "") for value in values))
    folded = "".join(
        character
        for character in unicodedata.normalize("NFKD", source.lower())
        if not unicodedata.combining(character)
    )
    transliterated = "".join(CYRILLIC_TO_LATIN.get(character, character) for character in folded)
    return textish(f"{source} {transliterated}" if transliterated != source.lower() else source)


def meilisearch_document(document: dict[str, object]) -> dict[str, object]:
    meili_id = re.sub(r"[^A-Za-z0-9_-]", "_", str(document.get("id", "")))
    if not meili_id:
        raise ValueError("Meilisearch document id is required")
    return {**document, "meili_id": meili_id}


def public_upload_image_url(value: str | None) -> str:
    raw = textish(value)
    if not raw:
        return ""
    try:
        parsed = urlparse(raw)
        src = parse_qs(parsed.query).get("src", [""])[0]
        candidate = src if src.startswith("https://") else raw
        candidate_path = urlparse(candidate).path
    except ValueError:
        return ""
    if not candidate.startswith("https://"):
        return ""
    if not re.search(r"/wp-content/uploads/\d{4}/\d{2}/", candidate_path):
        return ""
    if not re.search(r"\.(avif|gif|jpe?g|png|webp)$", candidate_path, re.I):
        return ""
    return candidate


MINIMUM_THUMBNAIL_RENDER_PX = 120


def is_navigation_thumbnail(value: str | None) -> bool:
    """True for a WordPress sidebar-widget render rather than a listing photo.

    Every crawled listing page carries the theme's "recently added" widget, which
    renders one foreign property through timthumb at a 45x45 box. Taking the
    first uploads image on the page therefore gave all 113 Bulgarian listings the
    same aerial photo. The requested render box separates the two: a gallery
    image is asked for large, a navigation thumbnail is asked for tiny.
    """
    raw = textish(value)
    if not raw or "timthumb.php" not in raw.lower():
        return False
    query = parse_qs(urlparse(raw).query)
    try:
        width = int(query.get("w", ["0"])[0])
        height = int(query.get("h", ["0"])[0])
    except ValueError:
        return False
    if width <= 0 or height <= 0:
        return False
    return width < MINIMUM_THUMBNAIL_RENDER_PX or height < MINIMUM_THUMBNAIL_RENDER_PX


def load_listing_thumbnails(artifact_dir: Path) -> dict[str, dict[str, str]]:
    media_path = artifact_dir / "media-inventory.csv"
    if not media_path.exists():
        return {}

    thumbnails: dict[str, dict[str, str]] = {}
    with media_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row.get("page_type") != "listing":
                continue
            page_url = textish(row.get("page_url"))
            image_url = public_upload_image_url(row.get("image_url"))
            if not page_url or not image_url or page_url in thumbnails:
                continue
            if is_navigation_thumbnail(row.get("image_url")):
                continue
            thumbnails[page_url] = {
                "thumbnail_url": image_url,
                "thumbnail_alt": textish(row.get("alt")),
            }
    return thumbnails


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


def load_location_reviews(path: Path = LOCATION_REVIEWS) -> dict[str, object]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_geography_registry(path: Path = GEOGRAPHY_REGISTRY) -> dict[str, dict[str, object]]:
    with path.open(encoding="utf-8") as handle:
        registry = json.load(handle)
    return {str(area["id"]): area for area in registry.get("areas", [])}


def geography_ancestors(area_id: str, areas_by_id: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    ancestors: list[dict[str, object]] = []
    seen: set[str] = set()
    current = areas_by_id.get(area_id)
    while current:
        current_id = str(current["id"])
        if current_id in seen:
            raise ValueError(f"Geography registry cycle at {current_id}")
        seen.add(current_id)
        ancestors.insert(0, current)
        current = areas_by_id.get(str(current.get("parent_id") or ""))
    if area_id and not ancestors:
        raise ValueError(f"Unknown reviewed geography id: {area_id}")
    return ancestors


def reviewed_location_fields(
    listing_id: str,
    legacy_location: str,
    reviews: dict[str, object],
    areas_by_id: dict[str, dict[str, object]],
) -> dict[str, object]:
    statuses = reviews.get("listing_statuses", {})
    status_row = statuses.get(listing_id, {}) if isinstance(statuses, dict) else {}
    overrides = reviews.get("listing_overrides", {})
    defaults = reviews.get("legacy_defaults", {})
    place_key = status_row.get("place") or (overrides.get(listing_id) if isinstance(overrides, dict) else None)
    if not place_key and isinstance(defaults, dict):
        place_key = defaults.get(legacy_location)
    places = reviews.get("places", {})
    place = places.get(place_key, {}) if isinstance(places, dict) else {}
    if place_key and not place:
        raise ValueError(f"Unknown reviewed location place: {place_key}")

    municipality = place.get("municipality", {}) if isinstance(place, dict) else {}
    settlement = place.get("settlement", {}) if isinstance(place, dict) else {}
    country_code = textish(place.get("country_code"))
    municipality_code = textish(municipality.get("code"))
    district_code = municipality_code[:3] if country_code == "BG" else ""
    districts = reviews.get("districts", {})
    district = districts.get(district_code, {}) if isinstance(districts, dict) else {}
    if district_code and not isinstance(district, dict):
        raise ValueError(f"Reviewed district {district_code} must be an object")
    if district_code and not district:
        raise ValueError(f"Unknown reviewed district code: {district_code}")
    status = status_row.get("status") if isinstance(status_row, dict) else None
    if not status:
        status = "confirmed_settlement" if settlement and place.get("country_code") == "BG" else "confirmed_foreign_settlement" if settlement else "legacy_area_only"
    geography_id = textish(place.get("geography_id"))
    if not geography_id and country_code == "BG":
        geography_id = (
            f"BG:settlement:{textish(settlement.get('ekatte'))}"
            if settlement.get("ekatte")
            else f"BG:municipality:{municipality_code}"
            if municipality_code
            else ""
        )
    geography_areas = geography_ancestors(geography_id, areas_by_id)
    if geography_areas and geography_areas[-1].get("country_code") != country_code:
        raise ValueError(f"Reviewed geography country mismatch for {listing_id}: {geography_id}")
    official_municipality = next((area for area in geography_areas if area.get("level") == "municipality"), {})
    official_region = next((area for area in geography_areas if area.get("level") in {"district", "region"}), {})
    municipality_code = municipality_code or textish(official_municipality.get("official_code"))
    return {
        "location": textish(place.get("location_name")) or legacy_location,
        "location_native": textish(place.get("location_native")),
        "location_legacy": legacy_location,
        "municipality": textish(municipality.get("name")) or textish(official_municipality.get("names", {}).get("en")),
        "municipality_code": municipality_code,
        "district": textish(district.get("name")),
        "district_code": district_code,
        "region": textish(official_region.get("names", {}).get("en")),
        "region_id": textish(official_region.get("id")),
        "country_code": country_code,
        "geography_id": geography_id,
        "geography_path": [str(area["id"]) for area in geography_areas],
        "settlement_ekatte": textish(settlement.get("ekatte")),
        "location_review_status": str(status),
        "location_precision": textish(place.get("location_precision")) or (
            "approximate"
            if status == "raw_locality_only"
            else "area_only"
        ),
    }


def reviewed_legacy_location(text: str, reviews: dict[str, object]) -> str:
    defaults = reviews.get("legacy_defaults", {})
    places = reviews.get("places", {})
    if not isinstance(defaults, dict) or not isinstance(places, dict):
        return ""
    matches: list[tuple[int, int, str]] = []
    for legacy_label, place_key in defaults.items():
        place = places.get(place_key)
        if not isinstance(place, dict):
            continue
        settlement = place.get("settlement", {}) if isinstance(place.get("settlement"), dict) else {}
        aliases = {
            textish(legacy_label),
            textish(place.get("location_name")),
            textish(place.get("location_native")),
            textish(settlement.get("name")),
            textish(settlement.get("native_name")),
        }
        for alias in aliases - {""}:
            match = re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", text, re.I)
            if match:
                matches.append((match.start(), -len(alias), textish(legacy_label)))
    return min(matches)[2] if matches else ""


def path_from_env(name: str, default: Path) -> Path:
    return Path(os.environ.get(name) or default)


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
    match = re.search(r"\b([1-6])\s*(?:bed|bedroom|bedrooms|спал)", text, re.I)
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


def review_search_fields(doc: dict[str, object], listing_id: str) -> dict[str, object]:
    """Expose the production query contract without publishing unreviewed crawl data."""
    return {
        "listing_reference": listing_id,
        "location_label": textish(str(doc.get("location") or "")),
        "publication_state": "review_required",
        "listing_status": "unverified",
        "locale_indexable": False,
    }


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
        **review_search_fields(doc, listing_id),
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
        **review_search_fields(doc, listing_id),
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
        for field in (
            "title",
            "description",
            "h1",
            "location",
            "property_type",
            "offer_type",
            "bedrooms",
            "bedrooms_not_applicable",
            "area_sqm",
            "price_eur",
            "price_on_request",
        ):
            if field in patch:
                doc[field] = patch[field]
        doc["search_text"] = search_text(
            doc.get("title"),
            doc.get("description"),
            doc.get("h1"),
            doc.get("location"),
            doc.get("location_native"),
            doc.get("municipality"),
        )
    return docs


def load_listing_docs(
    artifact_dir: Path,
    registry: dict[str, object],
    reviews: dict[str, object],
    geography_areas: dict[str, dict[str, object]],
) -> list[dict[str, object]]:
    metadata_path = artifact_dir / "metadata-inventory.csv"
    if not metadata_path.exists():
        raise FileNotFoundError(f"Missing metadata export: {metadata_path}")

    csv.field_size_limit(sys.maxsize)
    thumbnails = load_listing_thumbnails(artifact_dir)
    docs: list[dict[str, object]] = []
    seen_urls: set[str] = set()
    indexable_locales = public_indexable_locales(registry)

    with metadata_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row.get("url_type") != "listing" or textish(row.get("status")) != "200" or textish(row.get("error")):
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
            thumbnail = thumbnails.get(url, {})

            document = {
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
                    "location": reviewed_legacy_location(" ".join([title, h1, unquote(url)]), reviews),
                    "property_type": infer_property_type(type_text),
                    "offer_type": infer_offer(combined),
                    "bedrooms": infer_bedrooms(combined),
                    "bedrooms_not_applicable": False,
                    "area_sqm": None,
                    "price_eur": None,
                    "price_on_request": False,
                    "image_count": int(row.get("image_count") or 0),
                    "thumbnail_url": thumbnail.get("thumbnail_url", ""),
                    "thumbnail_alt": thumbnail.get("thumbnail_alt", "") or title,
                    "word_count": int(row.get("word_count") or 0),
                    "schema_present": row.get("schema_present") == "true",
                    "source_sitemap": textish(row.get("sitemap_source")),
                    "search_text": search_text(title, description, h1),
            }
            document.update(reviewed_location_fields(str(document["id"]), textish(document["location"]), reviews, geography_areas))
            document["search_text"] = search_text(
                title,
                description,
                h1,
                document["location"],
                document["location_native"],
                document["municipality"],
                document["district"],
                document["region"],
            )
            docs.append(document)

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
            {"name": "listing_reference", "type": "string", "facet": True},
            {"name": "search_document_type", "type": "string", "facet": True},
            {"name": "publication_state", "type": "string", "facet": True},
            {"name": "listing_status", "type": "string", "facet": True, "optional": True},
            {"name": "url", "type": "string"},
            {"name": "domain", "type": "string", "facet": True},
            {"name": "language", "type": "string", "facet": True},
            {"name": "locale", "type": "string", "facet": True},
            {"name": "locale_prefix", "type": "string", "facet": True},
            {"name": "locale_path", "type": "string"},
            {"name": "locale_is_indexable", "type": "bool", "facet": True},
            {"name": "locale_indexable", "type": "bool", "facet": True},
            {"name": "translation_status", "type": "string", "facet": True},
            {"name": "translation_source_locale", "type": "string", "facet": True},
            {"name": "translation_human_approved", "type": "bool", "facet": True},
            {"name": "translation_indexable", "type": "bool", "facet": True},
            {"name": "title", "type": "string"},
            {"name": "description", "type": "string", "optional": True},
            {"name": "location", "type": "string", "facet": True, "optional": True},
            {"name": "location_id", "type": "string", "facet": True, "optional": True},
            {"name": "location_label", "type": "string", "facet": True, "optional": True},
            {"name": "location_native", "type": "string", "optional": True},
            {"name": "location_legacy", "type": "string", "optional": True},
            {"name": "municipality", "type": "string", "facet": True, "optional": True},
            {"name": "municipality_code", "type": "string", "facet": True, "optional": True},
            {"name": "district", "type": "string", "facet": True, "optional": True},
            {"name": "district_code", "type": "string", "facet": True, "optional": True},
            {"name": "region", "type": "string", "facet": True, "optional": True},
            {"name": "region_id", "type": "string", "facet": True, "optional": True},
            {"name": "country_code", "type": "string", "facet": True, "optional": True},
            {"name": "geography_id", "type": "string", "facet": True, "optional": True},
            {"name": "geography_path", "type": "string[]", "facet": True, "optional": True},
            {"name": "settlement_ekatte", "type": "string", "facet": True, "optional": True},
            {"name": "location_review_status", "type": "string", "facet": True},
            {"name": "location_precision", "type": "string", "facet": True},
            {"name": "property_type", "type": "string", "facet": True},
            {"name": "property_family", "type": "string", "facet": True, "optional": True},
            {"name": "property_subtype", "type": "string", "facet": True, "optional": True},
            {"name": "offer_type", "type": "string", "facet": True},
            {"name": "bedrooms", "type": "int32", "facet": True, "optional": True},
            {"name": "bedrooms_count", "type": "int32", "facet": True, "optional": True},
            {"name": "premises_count", "type": "int32", "facet": True, "optional": True},
            {"name": "hotel_room_count", "type": "int32", "facet": True, "optional": True},
            {"name": "floor_number", "type": "int32", "facet": True, "optional": True},
            {"name": "total_floors", "type": "int32", "optional": True},
            {"name": "storeys_count", "type": "int32", "facet": True, "optional": True},
            {"name": "bedrooms_not_applicable", "type": "bool", "facet": True},
            {"name": "area_sqm", "type": "float", "facet": True, "optional": True},
            {"name": "living_area_sqm", "type": "float", "optional": True},
            {"name": "built_area_sqm", "type": "float", "optional": True},
            {"name": "usable_area_sqm", "type": "float", "optional": True},
            {"name": "gross_floor_area_sqm", "type": "float", "optional": True},
            {"name": "land_area_sqm", "type": "float", "facet": True, "optional": True},
            {"name": "primary_area_sqm", "type": "float", "facet": True, "optional": True},
            {"name": "price_eur", "type": "float", "facet": True, "optional": True},
            {"name": "price_amount", "type": "float", "facet": True, "optional": True},
            {"name": "price_currency", "type": "string", "facet": True, "optional": True},
            {"name": "price_period", "type": "string", "facet": True, "optional": True},
            {"name": "price_on_request", "type": "bool", "facet": True},
            {"name": "has_approved_tour", "type": "bool", "facet": True, "optional": True},
            {"name": "parking_kind", "type": "string", "facet": True, "optional": True},
            {"name": "condition", "type": "string", "facet": True, "optional": True},
            {"name": "construction_status", "type": "string", "facet": True, "optional": True},
            {"name": "zoning_status", "type": "string", "facet": True, "optional": True},
            {"name": "utilities_status", "type": "string", "facet": True, "optional": True},
            {"name": "road_access_status", "type": "string", "facet": True, "optional": True},
            {"name": "land_category", "type": "string", "optional": True},
            {"name": "permanent_use", "type": "string", "optional": True},
            {"name": "permitted_use", "type": "string", "optional": True},
            {"name": "public_latitude", "type": "float", "facet": True, "optional": True},
            {"name": "public_longitude", "type": "float", "facet": True, "optional": True},
            {"name": "public_location_precision", "type": "string", "optional": True},
            {"name": "image_count", "type": "int32"},
            {"name": "thumbnail_url", "type": "string", "optional": True},
            {"name": "thumbnail_alt", "type": "string", "optional": True},
            {"name": "word_count", "type": "int32"},
            {"name": "search_text", "type": "string"},
        ],
        "default_sorting_field": "image_count",
    }
    write_json(path, schema)


def write_meili_settings(path: Path) -> None:
    settings = {
        "searchableAttributes": ["title", "description", "h1", "search_text", "location", "location_label", "location_native", "municipality", "district", "region", "listing_reference"],
        "filterableAttributes": [
            "source_listing_id",
            "listing_reference",
            "search_document_type",
            "publication_state",
            "listing_status",
            "domain",
            "language",
            "locale",
            "locale_prefix",
            "locale_path",
            "locale_is_indexable",
            "locale_indexable",
            "translation_status",
            "translation_source_locale",
            "translation_human_approved",
            "translation_indexable",
            "location",
            "location_id",
            "location_label",
            "municipality",
            "municipality_code",
            "district",
            "district_code",
            "region",
            "region_id",
            "country_code",
            "geography_id",
            "geography_path",
            "settlement_ekatte",
            "location_review_status",
            "location_precision",
            "property_type",
            "property_family",
            "property_subtype",
            "offer_type",
            "bedrooms",
            "bedrooms_count",
            "premises_count",
            "hotel_room_count",
            "floor_number",
            "storeys_count",
            "bedrooms_not_applicable",
            "area_sqm",
            "land_area_sqm",
            "primary_area_sqm",
            "price_eur",
            "price_amount",
            "price_currency",
            "price_period",
            "price_on_request",
            "has_approved_tour",
            "parking_kind",
            "condition",
            "construction_status",
            "zoning_status",
            "utilities_status",
            "road_access_status",
            "public_latitude",
            "public_longitude",
        ],
        "sortableAttributes": ["price_eur", "price_amount", "area_sqm", "primary_area_sqm", "image_count", "word_count"],
        "displayedAttributes": ["*"],
        "rankingRules": ["words", "typo", "proximity", "attribute", "sort", "exactness"],
    }
    write_json(path, settings)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    locale_registry_path = path_from_env("MS_REALTY_LOCALE_REGISTRY_PATH", LOCALE_REGISTRY)
    listing_edits_path = path_from_env("MS_REALTY_LISTING_EDIT_LEDGER_PATH", LISTING_EDITS_LEDGER)
    location_reviews_path = path_from_env("MS_REALTY_LOCATION_REVIEWS_PATH", LOCATION_REVIEWS)
    geography_registry_path = path_from_env("MS_REALTY_GEOGRAPHY_REGISTRY_PATH", GEOGRAPHY_REGISTRY)
    registry = load_locale_registry(locale_registry_path)
    listing_edits = load_listing_edits(listing_edits_path)
    location_reviews = load_location_reviews(location_reviews_path)
    geography_areas = load_geography_registry(geography_registry_path)
    source_docs = apply_listing_edits(load_listing_docs(args.artifact_dir, registry, location_reviews, geography_areas), listing_edits)
    if not source_docs:
        raise SystemExit(f"No listing records found in {args.artifact_dir}")
    index_docs = build_index_docs(source_docs, registry)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    write_json(args.out_dir / "listings.json", source_docs)
    write_json(args.out_dir / "index-listings.json", index_docs)
    write_jsonl(args.out_dir / "typesense-listings.jsonl", index_docs)
    write_jsonl(args.out_dir / "meilisearch-listings.ndjson", [meilisearch_document(doc) for doc in index_docs])
    write_typesense_schema(args.out_dir / "typesense-schema.json")
    write_meili_settings(args.out_dir / "meilisearch-settings.json")

    summary = {
        "artifact_dir": repo_relative_path(args.artifact_dir),
        "locale_registry_path": repo_relative_path(locale_registry_path),
        "listing_edits_path": repo_relative_path(listing_edits_path),
        "location_reviews_path": repo_relative_path(location_reviews_path),
        "geography_registry_path": repo_relative_path(geography_registry_path),
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
