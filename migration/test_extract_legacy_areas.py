import json
import pathlib
import tempfile
import unittest

from extract_legacy_areas import build, parse_area, resolved_lot_id


class ParseAreaTest(unittest.TestCase):
    def test_reads_plain_and_comma_decimal_numbers(self):
        self.assertEqual(parse_area("900")["sqm"], 900.0)
        self.assertEqual(parse_area("140,66")["sqm"], 140.66)
        self.assertEqual(parse_area("174,1")["sqm"], 174.1)

    def test_scales_the_units_the_legacy_copy_uses(self):
        self.assertEqual(parse_area("93 кв.м")["sqm"], 93.0)
        self.assertEqual(parse_area("120 м2")["sqm"], 120.0)
        self.assertEqual(parse_area("2 дка")["sqm"], 2000.0)
        self.assertEqual(parse_area("1,5 га")["sqm"], 15000.0)

    def test_holds_a_range_without_choosing_an_end(self):
        parsed = parse_area("67-195")
        self.assertIsNone(parsed["sqm"])
        self.assertEqual(parsed["reason"], "range")
        self.assertEqual(parsed["range_sqm"], [67.0, 195.0])

    def test_refuses_an_unreadable_or_implausible_figure(self):
        self.assertEqual(parse_area("около сто")["reason"], "unreadable")
        self.assertEqual(parse_area("93 акра")["reason"], "unknown_unit")
        self.assertEqual(parse_area("0,4")["reason"], "implausible")

    def test_an_absent_value_is_not_an_error(self):
        self.assertEqual(parse_area(None), {"raw": None, "sqm": None, "reason": None})
        self.assertEqual(parse_area("  ")["reason"], None)


class ResolvedLotIdTest(unittest.TestCase):
    lot = {"legacy_lot_id": "890"}

    def test_keeps_the_mapped_id_without_an_override(self):
        self.assertEqual(resolved_lot_id(self.lot, {}), "890")

    def test_releases_the_id_when_the_record_moves_to_a_new_number(self):
        self.assertIsNone(resolved_lot_id(self.lot, {"action": "reassign_new", "lot_number": None}))
        self.assertIsNone(resolved_lot_id(self.lot, {"action": "assign_new", "lot_number": None}))

    def test_takes_the_reviewed_number_over_the_mapped_one(self):
        self.assertEqual(resolved_lot_id(None, {"action": "assign_legacy", "lot_number": 356}), "356")


def _posts_row(post_id):
    columns = ["''"] * 21
    columns[0] = f"{post_id}"
    columns[5] = "'title'"
    columns[7] = "'publish'"
    columns[11] = "'slug'"
    columns[20] = "'listings'"
    return f"({','.join(columns)})"


def _dump(path, posts, meta):
    rows = ",".join(_posts_row(post_id) for post_id in posts)
    values = ",".join(f"({i},{post_id},'{key}','{value}')" for i, (post_id, key, value) in enumerate(meta, 1))
    path.write_text(
        f"INSERT INTO `ms_posts` (`ID`) VALUES {rows};\n"
        f"INSERT INTO `ms_postmeta` (`meta_id`) VALUES {values};\n",
        encoding="utf-8",
    )


def _listing(reference):
    return {"id": reference, "collection": "listings", "property": f"property-{reference}", "facts": {"description": ""}}


class BuildTest(unittest.TestCase):
    """One pass over a dump that carries every case the classifier separates."""

    def setUp(self):
        self.root = pathlib.Path(tempfile.mkdtemp())
        dump_dir = self.root / "mysql"
        dump_dir.mkdir()
        _dump(
            dump_dir / "maklerre_newc.sql",
            posts=["11", "12", "13", "14"],
            meta=[
                ("11", "wtf_area", "4047"),
                ("12", "wtf_area", "59,21"),
                ("13", "wtf_area", "20740"),
                ("13", "wtf_total_area", "720"),
                ("14", "wtf_total_area", "734"),
            ],
        )
        _dump(dump_dir / "maklerre_newru.sql", posts=[], meta=[])
        self.dump_dir = dump_dir

        references = ["MS-PLOT", "MS-FLAT", "MS-CLASH", "MS-TOTAL", "MS-LOST"]
        families = ["plot", "apartment", "plot", "plot", "plot"]
        self.paths = {}
        for name, payload in {
            "seed": {
                "records": [_listing(reference) for reference in references],
                "properties": [
                    {"id": f"property-{reference}", "property_family": family}
                    for reference, family in zip(references, families)
                ],
            },
            "lot": {
                "records": [
                    {"new_reference": "MS-PLOT", "legacy_domain": "makler-realty.com", "legacy_post_id": "11", "legacy_lot_id": "1"},
                    {"new_reference": "MS-FLAT", "legacy_domain": "makler-realty.com", "legacy_post_id": "12", "legacy_lot_id": "2"},
                    {"new_reference": "MS-CLASH", "legacy_domain": "makler-realty.com", "legacy_post_id": "13", "legacy_lot_id": "3"},
                    {"new_reference": "MS-TOTAL", "legacy_domain": "makler-realty.com", "legacy_post_id": "14", "legacy_lot_id": "4"},
                ]
            },
            "live": {"listings": []},
            "overrides": {},
        }.items():
            path = self.root / f"{name}.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            self.paths[name] = path

        artifact = build(self.dump_dir, self.paths["lot"], self.paths["seed"], self.paths["live"], self.paths["overrides"])
        self.rows = {record["new_reference"]: record for record in artifact["records"]}
        self.artifact = artifact

    def test_a_plot_area_is_ready_because_the_family_has_one_area_field(self):
        row = self.rows["MS-PLOT"]
        self.assertEqual(row["status"], "ready")
        self.assertEqual(row["target_field"], "land_area_sqm")
        self.assertEqual(row["proposed_sqm"], 4047.0)

    def test_a_plot_that_stores_only_the_total_still_resolves(self):
        row = self.rows["MS-TOTAL"]
        self.assertEqual(row["status"], "ready")
        self.assertEqual(row["source_meta_key"], "wtf_total_area")
        self.assertEqual(row["proposed_sqm"], 734.0)

    def test_an_apartment_waits_for_a_field_decision(self):
        row = self.rows["MS-FLAT"]
        self.assertEqual(row["status"], "review")
        self.assertIsNone(row["target_field"])
        self.assertEqual(row["proposed_sqm"], 59.21)
        self.assertIn("field_choice_required", row["review_reasons"])
        self.assertEqual(row["field_candidates"], ["living_area_sqm", "built_area_sqm", "usable_area_sqm"])

    def test_two_area_keys_that_disagree_are_held(self):
        row = self.rows["MS-CLASH"]
        self.assertEqual(row["status"], "review")
        self.assertIn("conflicting_area_keys", row["review_reasons"])

    def test_a_listing_with_no_legacy_post_is_reported_not_dropped(self):
        row = self.rows["MS-LOST"]
        self.assertEqual(row["status"], "review")
        self.assertEqual(row["review_reasons"], ["no_legacy_post"])
        self.assertIsNone(row["proposed_sqm"])

    def test_the_artifact_never_claims_approval(self):
        self.assertEqual(self.artifact["approval"]["state"], "review_required")
        self.assertEqual(self.artifact["summary"]["ready"], 2)
        self.assertEqual(self.artifact["summary"]["review"], 3)
        self.assertEqual(sorted(self.artifact["review"]), ["conflicting_area_keys", "field_choice_required", "no_legacy_post"])


if __name__ == "__main__":
    unittest.main()
