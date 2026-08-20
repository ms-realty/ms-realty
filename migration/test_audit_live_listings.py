from __future__ import annotations

import unittest

from migration import audit_live_listings
from migration.crawl_inventory import FetchResult


def record(listing_id: str = "MS-CRAWL-0001") -> dict[str, object]:
    return {
        "id": listing_id,
        "source_url": f"https://example.test/{listing_id}",
        "cms_status": "source_imported_review_required",
        "source_locale": "bg",
        "media_workflow": {"public_gallery_assets": 12},
        "facts": {
            "title": "Тристаен & дом",
            "location": "Reviewed place",
            "location_legacy": "Legacy place",
            "price_eur": 600,
            "price_on_request": False,
            "area_sqm": None,
            "bedrooms": 2,
            "word_count": 500,
        },
    }


REVIEWS = {
    "places": {"reviewed": {"location_name": "Reviewed place"}},
    "listing_overrides": {"MS-CRAWL-0001": "reviewed"},
    "listing_statuses": {"MS-CRAWL-0001": {"status": "confirmed_settlement"}},
}


class LiveListingAuditTests(unittest.TestCase):
    def test_non_200_body_never_supplies_listing_facts(self) -> None:
        result = FetchResult(
            url="https://example.test/MS-CRAWL-0001",
            status=404,
            content_type="text/html",
            body="<title>Unrelated &amp; card</title><div class='post_content'>Площ: 999 m2 Цена: 999 €</div>",
            error="HTTP 404",
        )

        audited = audit_live_listings.audit_record(record(), result, REVIEWS, {})

        self.assertIsNone(audited["live_price_eur"])
        self.assertIsNone(audited["live_area_sqm"])
        self.assertIsNone(audited["live_bedrooms"])
        self.assertIsNone(audited["title_matches"])
        self.assertIn("source_404", audited["classifications"])

    def test_primary_content_comparison_normalizes_entities_and_flags_drift(self) -> None:
        result = FetchResult(
            url="https://example.test/MS-CRAWL-0001",
            final_url="https://example.test/MS-CRAWL-0001",
            status=200,
            content_type="text/html; charset=utf-8",
            body=(
                "<html><title>Тристаен &amp; дом</title><body>"
                "<aside>Цена: 1 €</aside><div class='post_content'><h1>Тристаен апартамент</h1>"
                "Площ: 86,5 m2 Количество стаи: 3 Цена: 650 €</div></body></html>"
            ),
        )

        audited = audit_live_listings.audit_record(record(), result, REVIEWS, {})

        self.assertEqual(audited["live_price_eur"], 650)
        self.assertEqual(audited["live_area_sqm"], 86.5)
        self.assertEqual(audited["live_bedrooms"], 2)
        self.assertTrue(audited["title_matches"])
        self.assertTrue(audited["location_matches_reviewed_mapping"])
        self.assertIn("price_drift", audited["classifications"])
        self.assertIn("missing_canonical_area", audited["classifications"])
        self.assertTrue(audited["title_entity_normalized"])
        self.assertNotIn("title_entity", audited["classifications"])
        self.assertNotIn("bedrooms_drift", audited["classifications"])

    def test_priority_review30_uses_score_then_listing_id(self) -> None:
        rows = [
            {
                "id": f"MS-CRAWL-{number:04d}",
                "source_url": f"https://example.test/{number}",
                "selection_score": 1,
                "classifications": ["review_required"],
            }
            for number in range(1, 32)
        ]
        rows[-1]["selection_score"] = 1000

        selected = audit_live_listings.priority_review30(rows)

        self.assertEqual(selected[0]["id"], "MS-CRAWL-0031")
        self.assertEqual([row["id"] for row in selected[1:]], [f"MS-CRAWL-{number:04d}" for number in range(1, 30)])

    def test_launch_candidate30_is_a_manual_review_queue_not_risk_queue(self) -> None:
        rows = []
        for number in range(1, 33):
            rows.append(
                {
                    "id": f"MS-CRAWL-{number:04d}",
                    "source_url": f"https://example.test/{number}",
                    "source_locale": "bg" if number != 32 else "ru",
                    "fetch_state": "ok",
                    "title_matches": True,
                    "live_area_sqm": 80,
                    "canonical_price_eur": 100_000,
                    "live_price_eur": 100_000,
                    "location_matches_reviewed_mapping": True,
                    "location_review_status": "confirmed_settlement",
                    "public_gallery_assets": number,
                    "word_count": 500,
                    "classifications": ["missing_canonical_area", "review_required"],
                }
            )
        rows[0]["classifications"] = ["price_drift", "review_required"]
        rows[1]["public_gallery_assets"] = 2

        selected = audit_live_listings.launch_candidate30(rows)

        self.assertEqual(len(selected), 30)
        self.assertNotIn("MS-CRAWL-0001", {row["id"] for row in selected})
        self.assertNotIn("MS-CRAWL-0002", {row["id"] for row in selected})
        self.assertEqual(selected[0]["id"], "MS-CRAWL-0030")
        self.assertEqual(
            selected[0]["remaining_launch_blockers"],
            ["broker_map_and_verify_observed_area", "complete_human_listing_review"],
        )


if __name__ == "__main__":
    unittest.main()
