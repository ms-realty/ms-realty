from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

from search import build_search_indexes


class SearchListingExtractionTests(unittest.TestCase):
    def test_entities_and_bedroom_terms_are_normalized_without_room_count_guessing(self) -> None:
        self.assertEqual(build_search_indexes.textish("Home &amp; garden&nbsp; flat"), "Home & garden flat")
        self.assertIsNone(build_search_indexes.infer_bedrooms("Количество стаи: 4"))
        self.assertIsNone(build_search_indexes.infer_bedrooms("4 стаи"))
        self.assertEqual(build_search_indexes.infer_bedrooms("Двустаен апартамент"), 1)
        self.assertEqual(build_search_indexes.infer_bedrooms("3 bedrooms"), 3)
        self.assertEqual(
            build_search_indexes.reviewed_legacy_location(
                "Апартамент в г. Сандански",
                {
                    "legacy_defaults": {"Sandanski": "sandanski"},
                    "places": {"sandanski": {"location_name": "Sandanski", "location_native": "Сандански"}},
                },
            ),
            "Sandanski",
        )

    def test_per_square_metre_rates_never_publish_as_a_monthly_rent(self) -> None:
        rates = build_search_indexes.quoted_per_square_metre_rates_eur("Наемната цена е 12 лв/м2")
        self.assertEqual([round(rate, 2) for rate in rates], [6.14])
        self.assertEqual(
            [round(rate, 2) for rate in build_search_indexes.quoted_per_square_metre_rates_eur("Цена 1,5 Евро за м2 без ДДС")],
            [1.5],
        )
        self.assertEqual(
            build_search_indexes.quoted_per_square_metre_rates_eur("Сграда с площ 500 m2 и цена 750 EUR."),
            [],
        )

        docs = [
            {"id": "rate-in-leva", "offer_type": "rent", "price_eur": 6, "price_on_request": False, "description": "Наемната цена е 12 лв/м2"},
            {"id": "implausible", "offer_type": "rent", "price_eur": 1, "price_on_request": False, "description": "Складово помещение с площ 1 700 кв.м."},
            {"id": "real-rent", "offer_type": "rent", "price_eur": 750, "price_on_request": False, "description": "Сграда с площ 500 m2 и цена 750 EUR."},
            {"id": "headline-total", "offer_type": "rent", "price_eur": 600, "price_on_request": False, "description": "Етаж 1: 220 кв.м. цена 2 Евро за м2 без ДДС"},
            {"id": "sale", "offer_type": "sale", "price_eur": 1, "price_on_request": False, "description": "Цена 3 ЛВ за квадратен метър"},
        ]
        guarded = {doc["id"]: doc for doc in build_search_indexes.apply_rent_unit_guard(docs)}

        self.assertIsNone(guarded["rate-in-leva"]["price_eur"])
        self.assertTrue(guarded["rate-in-leva"]["price_on_request"])
        self.assertIsNone(guarded["implausible"]["price_eur"])
        self.assertTrue(guarded["implausible"]["price_on_request"])
        self.assertEqual(guarded["real-rent"]["price_eur"], 750)
        # A headline total that matches no quoted rate is the source's own asking
        # price and stays until a human reconciles it.
        self.assertEqual(guarded["headline-total"]["price_eur"], 600)
        self.assertEqual(guarded["sale"]["price_eur"], 1)

    def test_sidebar_widget_renders_never_become_a_listing_thumbnail(self) -> None:
        widget = (
            "https://makler-realty.com/wp-content/themes/Avenue/timthumb.php"
            "?src=https://makler-realty.com/wp-content/uploads/2025/04/DJI_0696-680x383.jpg&h=45&w=45&zc=1"
        )
        gallery = (
            "https://makler-realty.com/wp-content/themes/Avenue/timthumb.php"
            "?src=https://makler-realty.com/wp-content/uploads/2024/12/815-2-680x451.jpg&h=600&w=1000&zc=1"
        )
        self.assertTrue(build_search_indexes.is_navigation_thumbnail(widget))
        self.assertFalse(build_search_indexes.is_navigation_thumbnail(gallery))
        self.assertFalse(
            build_search_indexes.is_navigation_thumbnail(
                "https://makler-realty.com/wp-content/uploads/2024/12/815-2-680x451.jpg"
            )
        )

        fields = ["source_domain", "page_url", "page_type", "image_url", "alt", "width", "height"]
        rows = [
            {"page_url": "https://example.test/listing/one", "page_type": "listing", "image_url": widget, "alt": "Recently added"},
            {"page_url": "https://example.test/listing/one", "page_type": "listing", "image_url": gallery, "alt": "Exterior"},
            {"page_url": "https://example.test/listing/two", "page_type": "listing", "image_url": widget, "alt": "Recently added"},
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_dir = Path(temp_dir)
            with (artifact_dir / "media-inventory.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)

            thumbnails = build_search_indexes.load_listing_thumbnails(artifact_dir)

        self.assertEqual(
            thumbnails["https://example.test/listing/one"]["thumbnail_url"],
            "https://makler-realty.com/wp-content/uploads/2024/12/815-2-680x451.jpg",
        )
        self.assertNotIn("https://example.test/listing/two", thumbnails)

    def test_loader_skips_error_rows_and_uses_only_reviewed_location_mappings(self) -> None:
        fields = [
            "source_domain",
            "sitemap_source",
            "url",
            "url_type",
            "status",
            "title",
            "meta_description",
            "canonical",
            "h1",
            "word_count",
            "image_count",
            "schema_present",
            "error",
        ]
        rows = [
            {
                "source_domain": "example.test",
                "url": "https://example.test/listing/error",
                "url_type": "listing",
                "status": "404",
                "title": "6 bedrooms in Sofia",
                "error": "HTTP 404",
            },
            {
                "source_domain": "example.test",
                "url": "https://example.test/listing/reviewed",
                "url_type": "listing",
                "status": "200",
                "title": "Двустаен &amp; обзаведен апартамент в София",
                "h1": "Двустаен апартамент",
            },
            {
                "source_domain": "example.test",
                "url": "https://example.test/listing/unreviewed",
                "url_type": "listing",
                "status": "200",
                "title": "House in Sofia",
            },
        ]
        registry = {
            "locales": [
                {
                    "code": "bg",
                    "public_enabled": True,
                    "indexable": True,
                    "route_segments": {"listing": "imoti"},
                }
            ]
        }
        reviews = {
            "places": {"reviewed": {"location_name": "Reviewed place"}},
            "listing_overrides": {"MS-00815": "reviewed"},
            "legacy_defaults": {"Sofia": "sofia"},
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_dir = Path(temp_dir)
            with (artifact_dir / "metadata-inventory.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)

            docs = build_search_indexes.load_listing_docs(artifact_dir, registry, reviews, {})

        self.assertEqual([doc["id"] for doc in docs], ["MS-00815", "MS-00907"])
        self.assertEqual(docs[0]["title"], "Двустаен & обзаведен апартамент в София")
        self.assertEqual(docs[0]["bedrooms"], 1)
        self.assertEqual(docs[0]["location"], "Reviewed place")
        self.assertEqual(docs[1]["location"], "")


if __name__ == "__main__":
    unittest.main()
