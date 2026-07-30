#!/usr/bin/env python3
"""Build a compact official-area SVG map from Eurostat GISCO NUTS 2024."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "production" / "data" / "geography-catalog.json"
OUTPUT_PATH = ROOT / "production" / "data" / "area-map.json"
SOURCE_URL = "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_20M_2024_4326.geojson"
COUNTRY_LEVELS = {"BG": ("BG", 3, "district"), "GR": ("EL", 2, "region")}


def coordinate_rings(geometry: dict[str, object]) -> list[list[list[float]]]:
    coordinates = geometry.get("coordinates", [])
    if geometry.get("type") == "Polygon":
        return coordinates
    if geometry.get("type") == "MultiPolygon":
        return [ring for polygon in coordinates for ring in polygon]
    raise ValueError(f"Unsupported GISCO geometry: {geometry.get('type')}")


def map_country(features: list[dict[str, object]], catalog: dict[str, object], country_code: str) -> dict[str, object]:
    source_country, level, area_level = COUNTRY_LEVELS[country_code]
    selected = [
        feature
        for feature in features
        if feature["properties"].get("CNTR_CODE") == source_country
        and int(feature["properties"].get("LEVL_CODE")) == level
    ]
    catalog_areas = {
        (area.get("nuts3") if country_code == "BG" else area.get("official_code")): area
        for area in catalog["areas"]
        if area.get("country_code") == country_code and area.get("level") == area_level
    }
    if len(selected) != len(catalog_areas):
        raise ValueError(f"{country_code} GISCO/catalog count mismatch: {len(selected)} != {len(catalog_areas)}")

    coordinates = [
        coordinate
        for feature in selected
        for ring in coordinate_rings(feature["geometry"])
        for coordinate in ring
    ]
    mean_latitude = sum(point[1] for point in coordinates) / len(coordinates)
    longitude_scale = math.cos(math.radians(mean_latitude))
    projected = [(point[0] * longitude_scale, -point[1]) for point in coordinates]
    min_x = min(point[0] for point in projected)
    max_x = max(point[0] for point in projected)
    min_y = min(point[1] for point in projected)
    max_y = max(point[1] for point in projected)
    width = 1000
    height = round(max(520, min(920, (max_y - min_y) / (max_x - min_x) * width)))
    padding = 24
    scale = min((width - 2 * padding) / (max_x - min_x), (height - 2 * padding) / (max_y - min_y))
    offset_x = (width - (max_x - min_x) * scale) / 2
    offset_y = (height - (max_y - min_y) * scale) / 2

    def project(point: list[float]) -> tuple[float, float]:
        return (
            offset_x + (point[0] * longitude_scale - min_x) * scale,
            offset_y + (-point[1] - min_y) * scale,
        )

    areas = []
    for feature in selected:
        nuts_id = feature["properties"]["NUTS_ID"]
        area = catalog_areas.get(nuts_id)
        if not area:
            raise ValueError(f"Missing catalog area for GISCO feature {nuts_id}")
        commands = []
        for ring in coordinate_rings(feature["geometry"]):
            points = [project(point) for point in ring]
            commands.append(
                "M"
                + " ".join(
                    f"{x:.1f},{y:.1f}" if index == 0 else f"L{x:.1f},{y:.1f}"
                    for index, (x, y) in enumerate(points)
                )
                + "Z"
            )
        areas.append(
            {
                "id": area["id"],
                "country_code": country_code,
                "level": area_level,
                "official_code": area["official_code"],
                "nuts_code": nuts_id,
                "names": area["names"],
                "path": "".join(commands),
            }
        )

    return {
        "country_code": country_code,
        "area_level": area_level,
        "view_box": f"0 0 {width} {height}",
        "areas": sorted(areas, key=lambda area: area["names"]["en"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-url", default=SOURCE_URL)
    parser.add_argument("--catalog", type=Path, default=CATALOG_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()

    request = urllib.request.Request(args.source_url, headers={"User-Agent": "MS-Realty geography build"})
    with urllib.request.urlopen(request, timeout=60) as response:
        source_bytes = response.read()
    source = json.loads(source_bytes)
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    payload = {
        "version": 1,
        "source": {
            "authority": "Eurostat GISCO",
            "dataset": "NUTS 2024",
            "scale": "20M",
            "crs": "EPSG:4326",
            "url": args.source_url,
            "sha256": hashlib.sha256(source_bytes).hexdigest(),
            "license_url": "https://ec.europa.eu/eurostat/about-us/policies/copyright",
        },
        "countries": [
            map_country(source["features"], catalog, country_code)
            for country_code in COUNTRY_LEVELS
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(
        f"Wrote {sum(len(country['areas']) for country in payload['countries'])} official map areas "
        f"to {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
