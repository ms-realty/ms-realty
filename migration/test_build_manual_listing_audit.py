from __future__ import annotations

import csv
import io
import unittest

from migration import build_manual_listing_audit as manual


def canonical(listing_id: str) -> dict[str, object]:
    return {"id": listing_id, "source_url": f"https://example.test/{listing_id}"}


def review(listing_id: str, status: str = "review") -> dict[str, object]:
    return {
        "id": listing_id,
        "source_url": f"https://example.test/{listing_id}",
        "checked_at": "2026-08-13T12:00:00Z",
        "http_status": 200,
        "review_status": status,
        "observed": {
            "title": "Visible title",
            "price_eur_or_por": 100000,
            "area_sqm_or_unknown": "unknown",
            "bedrooms_or_unknown": 2,
            "location_or_unknown": "Sandanski",
            "property_scope": "single apartment",
            "availability_signal": "offered for sale",
            "gallery_assets_observed_or_sampled": "3 sampled",
        },
        "issues": ["area_semantics_unclear"],
        "required_action": "Broker confirms area semantics.",
        "broker_confirm": ["primary public area"],
    }


def batch(rows: list[dict[str, object]]) -> dict[str, object]:
    return {
        "schema_version": 1,
        "reviewer_kind": manual.REVIEWER_KIND,
        "count": len(rows),
        "listings": rows,
    }


class ManualListingAuditTests(unittest.TestCase):
    def test_validation_requires_exact_ids_and_never_accepts_approval_status(self) -> None:
        canonical_rows = [canonical("MS-1"), canonical("MS-2")]
        reviews = manual.validate_batches([batch([review("MS-1")]), batch([review("MS-2")])], canonical_rows)
        self.assertEqual([row["id"] for row in reviews], ["MS-1", "MS-2"])
        self.assertFalse(manual.build_manual_audit(reviews)["broker_approval_granted"])

        approved = review("MS-2", "approved")
        with self.assertRaisesRegex(ValueError, "status is invalid"):
            manual.validate_batches([batch([review("MS-1")]), batch([approved])], canonical_rows)

    def test_packet_retains_every_human_gate_and_blank_signoff_columns(self) -> None:
        listing_ids = [f"MS-{index}" for index in range(1, 31)]
        live = {
            "launch_candidate30": [{"rank": rank, "id": listing_id} for rank, listing_id in enumerate(listing_ids, 1)],
            "listings": [
                {"id": listing_id, "live_price_eur": 100000, "live_area_sqm": 80, "selection_score": index}
                for index, listing_id in enumerate(listing_ids, 1)
            ],
        }
        seed = {
            "records": [
                {
                    "id": listing_id,
                    "source_url": f"https://example.test/{listing_id}",
                    "source_locale": "bg",
                    "property": "property-MS-1",
                    "facts": {"price_eur": 100000, "price_on_request": False, "area_sqm": None},
                    "seo": {"title": "Visible title"},
                    "media_workflow": {"public_gallery_assets": 3},
                    "translations": [],
                }
                for listing_id in listing_ids
            ],
            "properties": [
                {"id": f"property-{listing_id}", "property_family": "apartment", "property_subtype": "apartment"}
                for listing_id in listing_ids
            ],
        }
        reviews = [review(listing_id, "pass") for listing_id in listing_ids]
        packet = manual.candidate_packet(live, seed, reviews)
        self.assertEqual(packet["candidate_count"], 30)
        self.assertEqual(packet["publish_ready_count"], 0)
        self.assertEqual(packet["selection_basis"], "manual_source_pass_then_live_selection_score")
        self.assertEqual(packet["listings"][0]["id"], "MS-30")
        self.assertTrue(packet["listings"][0]["broker_approval_required"])
        self.assertIn("broker_confirm_current_availability", packet["listings"][0]["remaining_blockers"])
        csv_rows = list(csv.DictReader(io.StringIO(manual.render_packet_csv(packet))))
        self.assertEqual(csv_rows[0]["facts_reviewer"], "")
        self.assertEqual(csv_rows[0]["media_reviewer"], "")
        self.assertEqual(csv_rows[0]["approved_at"], "")

        live["launch_candidate30"][-1]["id"] = listing_ids[0]
        with self.assertRaisesRegex(ValueError, "30 unique listing ids"):
            manual.candidate_packet(live, seed, reviews)


if __name__ == "__main__":
    unittest.main()
