# Official settlement-coordinate source evidence

## Decision

**Not automatable:** the checked official sources cannot safely create approximate point coordinates for Bulgarian EKATTE settlements.

| Source | What it identifies | Coordinate/geometry evidence | Decision |
| --- | --- | --- | --- |
| [NSI EKATTE territorial units](https://www.nsi.bg/nrnm/ekatte/territorial-units/json) | EKATTE settlements and administrative metadata | The checked JSON response had 5,256 settlement records plus one metadata item, and no latitude, longitude, point, or geometry field. | Cannot create settlement points. |
| [Eurostat GISCO NUTS 2024 level-3 labels](https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_LB_2024_4326_LEVL_3.geojson) | NUTS level-3 regions | The checked GeoJSON had 1,345 label points, including 28 Bulgarian regional labels; it has no EKATTE identifier. | Cannot safely join to settlements. |

The machine-readable observations and exact source URLs are in [`official-settlement-coordinate-sources.json`](official-settlement-coordinate-sources.json). No coordinate values are bundled by this contract.

## Guardrail

Do not derive a settlement point from a NUTS label point or centroid, a settlement name, municipality, district, or elevation. Those substitutions would misrepresent listing location precision.

## Recheck

Run the offline contract check:

```sh
python3 geography/test_official_settlement_coordinate_sources.py
```

To fetch the two official sources and verify their current shape and scope:

```sh
python3 geography/test_official_settlement_coordinate_sources.py --live
```

The live check is intentionally opt-in because it depends on the public source endpoints. A later importer may be added only after an approved source provides settlement-level geometry or coordinates tied to a stable settlement identifier.
