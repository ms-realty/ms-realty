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
            "listing_overrides": {"MS-CRAWL-0001": "reviewed"},
            "legacy_defaults": {"Sofia": "sofia"},
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_dir = Path(temp_dir)
            with (artifact_dir / "metadata-inventory.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)

            docs = build_search_indexes.load_listing_docs(artifact_dir, registry, reviews, {})

        self.assertEqual([doc["id"] for doc in docs], ["MS-CRAWL-0001", "MS-CRAWL-0002"])
        self.assertEqual(docs[0]["title"], "Двустаен & обзаведен апартамент в София")
        self.assertEqual(docs[0]["bedrooms"], 1)
        self.assertEqual(docs[0]["location"], "Reviewed place")
        self.assertEqual(docs[1]["location"], "")


if __name__ == "__main__":
    unittest.main()
