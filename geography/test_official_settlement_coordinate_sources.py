#!/usr/bin/env python3
"""Verify that checked official sources cannot supply EKATTE settlement points."""

import json
import sys
import unittest
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
CONTRACT_PATH = ROOT / "official-settlement-coordinate-sources.json"
RUN_LIVE = "--live" in sys.argv
if RUN_LIVE:
    sys.argv.remove("--live")

COORDINATE_FIELD_NAMES = {
    "coordinates",
    "geo",
    "geometry",
    "lat",
    "latitude",
    "lng",
    "lon",
    "longitude",
    "point",
}


def fetch_json(url):
    request = Request(url, headers={"User-Agent": "ms-realty-source-evidence/1.0"})
    with urlopen(request, timeout=30) as response:  # nosec B310: URLs are fixed in the checked contract.
        return json.load(response)


class OfficialSettlementCoordinateSourcesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
        cls.sources = {source["id"]: source for source in cls.contract["sources"]}

    def test_contract_refuses_unsafe_settlement_point_import(self):
        self.assertEqual(self.contract["decision"]["status"], "not_automatable")
        self.assertEqual(
            self.sources["nsi-ekatte-territorial-units"]["coordinate_or_geometry_fields"], []
        )
        self.assertFalse(
            self.sources["nsi-ekatte-territorial-units"]["suitable_for_approximate_settlement_points"]
        )
        self.assertIsNone(
            self.sources["eurostat-gisco-nuts-label-points-2024"]["settlement_identifier"]
        )
        self.assertFalse(
            self.sources["eurostat-gisco-nuts-label-points-2024"]["suitable_for_approximate_settlement_points"]
        )

    @unittest.skipUnless(RUN_LIVE, "pass --live to recheck public source endpoints")
    def test_live_nsi_ekatte_has_no_coordinate_fields(self):
        source = self.sources["nsi-ekatte-territorial-units"]
        payload = fetch_json(source["url"])
        records = [record for record in payload if isinstance(record, dict) and "ekatte" in record]
        fields = {field for record in records for field in record}

        self.assertGreaterEqual(len(records), source["observed_settlement_record_count"])
        self.assertTrue(set(source["observed_fields"]).issubset(fields))
        self.assertFalse(COORDINATE_FIELD_NAMES.intersection(field.lower() for field in fields))

    @unittest.skipUnless(RUN_LIVE, "pass --live to recheck public source endpoints")
    def test_live_gisco_points_are_nuts_regions_not_settlements(self):
        source = self.sources["eurostat-gisco-nuts-label-points-2024"]
        payload = fetch_json(source["url"])
        features = payload["features"]
        bulgarian_regions = [
            feature
            for feature in features
            if feature["properties"].get("CNTR_CODE") == "BG"
            and feature["properties"].get("LEVL_CODE") == 3
        ]
        properties = {
            field for feature in bulgarian_regions for field in feature["properties"]
        }

        self.assertEqual(payload["type"], "FeatureCollection")
        self.assertEqual(len(features), source["observed_feature_count"])
        self.assertEqual(len(bulgarian_regions), source["observed_bulgarian_feature_count"])
        self.assertTrue(all(feature["geometry"]["type"] == "Point" for feature in bulgarian_regions))
        self.assertTrue(set(source["required_properties"]).issubset(properties))
        self.assertNotIn("ekatte", {field.lower() for field in properties})


if __name__ == "__main__":
    unittest.main()
