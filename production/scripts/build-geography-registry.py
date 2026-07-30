#!/usr/bin/env python3
"""Build the source-attributed BG/GR geography registry from official snapshots."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import unicodedata
import urllib.request
import zipfile
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "production/data/geography-catalog.json"
REGISTRY_PATH = ROOT / "production/data/geography-registry.json"

DEFAULT_NSI = "https://www.nsi.bg/nrnm/ekatte/archive/json/Ekatte-2025-json.zip/download"
DEFAULT_ELSTAT = (
    "https://www.statistics.gr/documents/20181/17286366/"
    "MON_PLI_DHM_OIKISN_2021.xlsx/2b5a5f24-4083-ede5-7201-3c4fb109fb44"
)
DEFAULT_NUTS = "https://gisco-services.ec.europa.eu/distribution/v2/nuts/csv/NUTS_AT_2024.csv"

GREEK_NUTS1 = {"1": "EL5", "2": "EL6", "3": "EL3", "4": "EL4"}
GREEK_NUTS2 = {
    "11": "EL51",
    "12": "EL52",
    "21": "EL53",
    "22": "EL54",
    "31": "EL61",
    "32": "EL64",
    "41": "EL62",
    "42": "EL63",
    "43": "EL65",
    "51": "EL30",
    "61": "EL41",
    "62": "EL42",
    "71": "EL43",
}
GREEK_LEVELS = {
    4: "regional_unit",
    5: "municipality",
    6: "municipal_unit",
    7: "community",
    8: "settlement",
}
GREEK_PREFIXES = {
    3: ("ΠΕΡΙΦΕΡΕΙΑ ",),
    4: ("ΠΕΡΙΦΕΡΕΙΑΚΗ ΕΝΟΤΗΤΑ ",),
    5: ("ΔΗΜΟΣ ",),
    6: ("ΔΗΜΟΤΙΚΗ ΕΝΟΤΗΤΑ ",),
    7: ("ΔΗΜΟΤΙΚΗ ΚΟΙΝΟΤΗΤΑ ", "ΤΟΠΙΚΗ ΚΟΙΝΟΤΗΤΑ ", "ΚΟΙΝΟΤΗΤΑ "),
}
GREEK_TRANSLITERATION = str.maketrans(
    {
        "α": "a",
        "β": "v",
        "γ": "g",
        "δ": "d",
        "ε": "e",
        "ζ": "z",
        "η": "i",
        "θ": "th",
        "ι": "i",
        "κ": "k",
        "λ": "l",
        "μ": "m",
        "ν": "n",
        "ξ": "x",
        "ο": "o",
        "π": "p",
        "ρ": "r",
        "σ": "s",
        "ς": "s",
        "τ": "t",
        "υ": "y",
        "φ": "f",
        "χ": "ch",
        "ψ": "ps",
        "ω": "o",
    }
)


def read_bytes(location: str) -> bytes:
    if re.match(r"^https?://", location):
        request = urllib.request.Request(location, headers={"User-Agent": "MS-Realty-Geography/1.0"})
        with urllib.request.urlopen(request, timeout=90) as response:
            return response.read()
    return Path(location).expanduser().read_bytes()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_json(archive: zipfile.ZipFile, filename: str) -> list[dict]:
    return json.loads(archive.read(filename).decode("utf-8-sig"))


def data_rows(rows: list[dict], required_key: str) -> list[dict]:
    return [row for row in rows if row.get(required_key)]


def area(
    *,
    area_id: str,
    country: str,
    level: str,
    code: str,
    native: str,
    english: str,
    source_id: str,
    parent_id: str | None = None,
    **metadata: object,
) -> dict:
    result = {
        "id": area_id,
        "country_code": country,
        "level": level,
        "official_code": code,
        "names": {"native": native.strip(), "en": english.strip()},
        "source_id": source_id,
    }
    if parent_id:
        result["parent_id"] = parent_id
    result.update({key: value for key, value in metadata.items() if value not in (None, "", [])})
    return result


def build_bulgaria(nsi_bytes: bytes) -> list[dict]:
    with zipfile.ZipFile(io.BytesIO(nsi_bytes)) as archive:
        nuts1_rows = data_rows(source_json(archive, "ek_reg1.json"), "nuts1")
        nuts2_rows = data_rows(source_json(archive, "ek_reg2.json"), "nuts2")
        district_rows = data_rows(source_json(archive, "ek_obl.json"), "oblast")
        municipality_rows = data_rows(source_json(archive, "ek_obst.json"), "obshtina")
        settlement_rows = data_rows(source_json(archive, "ek_atte.json"), "ekatte")
        municipal_district_rows = data_rows(source_json(archive, "ek_raion.json"), "raion")

    results: list[dict] = []
    for row in nuts1_rows:
        code = row["nuts1"]
        results.append(
            area(
                area_id=f"BG:NUTS1:{code}",
                country="BG",
                level="NUTS1",
                code=code,
                native=row["name"],
                english=row["name_en"],
                source_id="bg-nsi-ekatte",
            )
        )
    for row in nuts2_rows:
        code = row["nuts2"]
        results.append(
            area(
                area_id=f"BG:NUTS2:{code}",
                country="BG",
                level="NUTS2",
                code=code,
                native=row["name"],
                english=row["name_en"],
                source_id="bg-nsi-ekatte",
                parent_id=f"BG:NUTS1:{row['nuts1']}",
            )
        )
    for row in district_rows:
        code = row["oblast"]
        results.append(
            area(
                area_id=f"BG:district:{code}",
                country="BG",
                level="district",
                code=code,
                native=row["name"],
                english=row["name_en"],
                source_id="bg-nsi-ekatte",
                parent_id=f"BG:NUTS2:{row['nuts2']}",
                nuts1=row["nuts1"],
                nuts2=row["nuts2"],
                nuts3=row["nuts3"],
                capital_ekatte=row.get("ekatte"),
            )
        )
    for row in municipality_rows:
        code = row["obshtina"]
        district_code = code[:3]
        results.append(
            area(
                area_id=f"BG:municipality:{code}",
                country="BG",
                level="municipality",
                code=code,
                native=row["name"],
                english=row["name_en"],
                source_id="bg-nsi-ekatte",
                parent_id=f"BG:district:{district_code}",
                nuts1=row.get("nuts1"),
                nuts2=row.get("nuts2"),
                nuts3=row.get("nuts3"),
                capital_ekatte=row.get("ekatte"),
                category=row.get("category"),
            )
        )

    settlement_by_ekatte = {row["ekatte"]: row for row in settlement_rows}
    for row in municipal_district_rows:
        host = settlement_by_ekatte.get(row["raion"].split("-", 1)[0])
        if not host:
            continue
        code = row["raion"]
        results.append(
            area(
                area_id=f"BG:municipal_district:{code}",
                country="BG",
                level="municipal_district",
                code=code,
                native=row["name"],
                english=row["name_en"],
                source_id="bg-nsi-ekatte",
                parent_id=f"BG:municipality:{host['obshtina']}",
                host_settlement_ekatte=host["ekatte"],
            )
        )
    for row in settlement_rows:
        code = row["ekatte"]
        results.append(
            area(
                area_id=f"BG:settlement:{code}",
                country="BG",
                level="settlement",
                code=code,
                native=row["name"],
                english=row["name_en"],
                source_id="bg-nsi-ekatte",
                parent_id=f"BG:municipality:{row['obshtina']}",
                nuts1=row.get("nuts1"),
                nuts2=row.get("nuts2"),
                nuts3=row.get("nuts3"),
                settlement_type=row.get("t_v_m"),
                mayoralty_code=row.get("kmetstvo"),
                category=row.get("category"),
                altitude_band=row.get("text"),
            )
        )
    return results


def xlsx_rows(workbook_bytes: bytes) -> list[list[str]]:
    namespace = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    with zipfile.ZipFile(io.BytesIO(workbook_bytes)) as workbook:
        shared_root = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
        shared = ["".join(node.text or "" for node in item.iter(f"{namespace}t")) for item in shared_root]
        sheet_root = ElementTree.fromstring(workbook.read("xl/worksheets/sheet1.xml"))

    rows: list[list[str]] = []
    for row_node in sheet_root.iter(f"{namespace}row"):
        values = [""] * 7
        for cell in row_node.findall(f"{namespace}c"):
            reference = cell.get("r", "")
            column_letters = re.match(r"[A-Z]+", reference)
            if not column_letters:
                continue
            column = 0
            for character in column_letters.group(0):
                column = column * 26 + ord(character) - 64
            if column > len(values):
                continue
            value_node = cell.find(f"{namespace}v")
            if value_node is None:
                continue
            value = value_node.text or ""
            if cell.get("t") == "s":
                value = shared[int(value)]
            values[column - 1] = value.strip()
        rows.append(values)
    return rows


def greek_display_name(raw: str, level: int) -> str:
    name = re.sub(r"\s+", " ", raw).strip()
    for prefix in GREEK_PREFIXES.get(level, ()):
        if name.upper().startswith(prefix):
            name = name[len(prefix) :].strip()
            break
    if level == 8:
        name = re.sub(r",(?:η|ο|το|οι|τα|ή|ό)$", "", name, flags=re.IGNORECASE)
    return name.title() if name.isupper() else name


def transliterate_greek(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.lower())
    unaccented = "".join(character for character in decomposed if unicodedata.category(character) != "Mn")
    transliterated = unaccented.translate(GREEK_TRANSLITERATION)
    return re.sub(r"\s+", " ", transliterated).strip().title()


def greek_nuts_areas(nuts_bytes: bytes, catalog: dict) -> list[dict]:
    overrides = {item["id"]: item for item in catalog["areas"] if item["country_code"] == "GR"}
    results: list[dict] = []
    for row in csv.DictReader(io.StringIO(nuts_bytes.decode("utf-8-sig"))):
        code = row["NUTS_ID"]
        if row["CNTR_CODE"] != "EL" or len(code) not in (3, 4):
            continue
        level = "NUTS1" if len(code) == 3 else "region"
        area_id = f"GR:{level}:{code}"
        existing = overrides.get(area_id)
        results.append(
            area(
                area_id=area_id,
                country="GR",
                level=level,
                code=code,
                native=existing["names"]["native"] if existing else row["NUTS_NAME"].strip(),
                english=existing["names"]["en"] if existing else row["NAME_LATN"].strip(),
                source_id="eu-nuts-2024",
                parent_id=None if level == "NUTS1" else f"GR:NUTS1:{code[:3]}",
                nuts2=code if level == "region" else None,
            )
        )
    return results


def build_greece(elstat_bytes: bytes, nuts_bytes: bytes, catalog: dict) -> list[dict]:
    results = greek_nuts_areas(nuts_bytes, catalog)
    stack: dict[int, str] = {}
    for row in xlsx_rows(elstat_bytes)[1:]:
        if not row[1].isdigit():
            continue
        level = int(row[1])
        raw_nuts1, raw_nuts2, code, description = row[2], row[3], row[4], row[5]
        if level == 0:
            continue
        if level == 1:
            stack[1] = f"GR:NUTS1:{GREEK_NUTS1[raw_nuts1]}"
            continue
        if level == 2:
            stack[2] = stack[1]
            continue
        if level == 3:
            stack[3] = f"GR:region:{GREEK_NUTS2[raw_nuts2]}"
            continue
        if level not in GREEK_LEVELS:
            continue

        nuts2 = GREEK_NUTS2[raw_nuts2]
        registry_level = GREEK_LEVELS[level]
        area_id = f"GR:{registry_level}:{nuts2}:{code}"
        display_name = greek_display_name(description, level)
        population = int(float(row[6])) if row[6] else None
        results.append(
            area(
                area_id=area_id,
                country="GR",
                level=registry_level,
                code=code,
                native=display_name,
                english=transliterate_greek(display_name),
                source_id="gr-elstat-census-2021",
                parent_id=stack[level - 1],
                nuts1=GREEK_NUTS1[raw_nuts1],
                nuts2=nuts2,
                official_name_native=description,
                population_2021=population,
            )
        )
        stack[level] = area_id
        for deeper in range(level + 1, 9):
            stack.pop(deeper, None)
    return results


def counts_for(areas: list[dict], country: str) -> dict[str, int]:
    counts = Counter(item["level"] for item in areas if item["country_code"] == country)
    return dict(sorted(counts.items()))


def update_catalog(catalog: dict, registry: dict, output_path: Path) -> None:
    source = {
        "id": "gr-elstat-census-2021",
        "authority": "Hellenic Statistical Authority (ELSTAT)",
        "url": "https://www.statistics.gr/el/2021-census-res-pop-results",
        "document_url": DEFAULT_ELSTAT,
        "format": "official XLSX census hierarchy",
        "verified_at": "2026-07-30",
        "coverage": ["regional_unit", "municipality", "municipal_unit", "community", "settlement"],
        "use": "Official 2021 census hierarchy and settlement names, published to settlement level on 29 March 2024.",
    }
    if not any(item["id"] == source["id"] for item in catalog["sources"]):
        catalog["sources"].append(source)

    bulgarian_districts = [
        item for item in catalog["areas"] if item["country_code"] == "BG" and item["level"] == "district"
    ]
    greek_browse_areas = [
        item
        for item in registry["areas"]
        if item["country_code"] == "GR" and item["level"] in {"NUTS1", "region"}
    ]
    catalog["areas"] = bulgarian_districts + greek_browse_areas
    catalog["registry"] = {
        "path": str(output_path.relative_to(ROOT)),
        "generated_at": registry["generated_at"],
        "area_count": len(registry["areas"]),
        "source_snapshots": registry["source_snapshots"],
    }
    bg_counts = registry["coverage"]["BG"]["counts"]
    gr_counts = registry["coverage"]["GR"]["counts"]
    catalog["coverage"]["BG"]["bundled"] = {
        level: {"count": count, "source_id": "bg-nsi-ekatte"} for level, count in bg_counts.items()
    }
    catalog["coverage"]["BG"]["import_required"] = {
        key: value
        for key, value in catalog["coverage"]["BG"]["import_required"].items()
        if key in {"map_geometry", "postal_code"}
    }
    catalog["coverage"]["GR"]["scope"] = (
        "The official registry is bundled country-wide to preserve every migrated Greek listing. "
        "Northern Greece (NUTS1 EL5) is the complete active market scope; other Greek regions can be activated without a schema import."
    )
    catalog["coverage"]["GR"]["bundled"] = {
        level: {
            "count": count,
            "source_id": "eu-nuts-2024" if level in {"NUTS1", "region"} else "gr-elstat-census-2021",
        }
        for level, count in gr_counts.items()
    }
    catalog["coverage"]["GR"]["import_required"] = {
        key: value
        for key, value in catalog["coverage"]["GR"]["import_required"].items()
        if key in {"map_geometry", "postal_code"}
    }
    for profile in catalog["import_profiles"]:
        profile["status"] = "bundled"
        if profile["country_code"] == "GR":
            profile["source_id"] = "gr-elstat-census-2021"
            profile["artifact_files"] = {"hierarchy": "MON_PLI_DHM_OIKISN_2021.xlsx"}
            profile.pop("manual_review_required", None)
    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--nsi", default=DEFAULT_NSI, help="NSI EKATTE 2025 zip path or URL")
    parser.add_argument("--elstat", default=DEFAULT_ELSTAT, help="ELSTAT settlement XLSX path or URL")
    parser.add_argument("--nuts", default=DEFAULT_NUTS, help="Eurostat NUTS 2024 CSV path or URL")
    parser.add_argument("--output", default=str(REGISTRY_PATH))
    parser.add_argument("--generated-at", default=datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"))
    args = parser.parse_args()

    nsi_bytes = read_bytes(args.nsi)
    elstat_bytes = read_bytes(args.elstat)
    nuts_bytes = read_bytes(args.nuts)
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    areas = build_bulgaria(nsi_bytes) + build_greece(elstat_bytes, nuts_bytes, catalog)
    ids = [item["id"] for item in areas]
    if len(ids) != len(set(ids)):
        duplicates = [item for item, count in Counter(ids).items() if count > 1]
        raise ValueError(f"Duplicate geography ids: {duplicates[:10]}")

    registry = {
        "version": 1,
        "generated_at": args.generated_at,
        "source_snapshots": [
            {"source_id": "bg-nsi-ekatte", "revision": "EKATTE 2025", "sha256": sha256(nsi_bytes)},
            {
                "source_id": "gr-elstat-census-2021",
                "revision": "2021 census settlement results published 2024-03-29",
                "sha256": sha256(elstat_bytes),
            },
            {"source_id": "eu-nuts-2024", "revision": "NUTS 2024", "sha256": sha256(nuts_bytes)},
        ],
        "coverage": {
            "BG": {"scope": "country", "counts": counts_for(areas, "BG")},
            "GR": {
                "scope": "country_registry_with_northern_greece_active_market",
                "active_market_nuts1": ["EL5"],
                "counts": counts_for(areas, "GR"),
            },
        },
        "areas": sorted(areas, key=lambda item: (item["country_code"], item["level"], item["id"])),
    }
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(registry, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    update_catalog(catalog, registry, output_path)
    print(
        json.dumps(
            {
                "kind": "geography_registry",
                "output": str(output_path.relative_to(ROOT)),
                "areas": len(areas),
                "coverage": registry["coverage"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
