from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

from migration.compare_crawl_artifacts import build_delta, markdown
from migration.crawl_inventory import write_csv


FIELDS = [
    "source_domain",
    "sitemap_source",
    "url",
    "url_type",
    "status",
    "final_url",
    "title",
    "meta_description",
    "canonical",
    "robots_meta",
    "hreflang",
    "h1",
    "word_count",
    "image_count",
    "schema_present",
    "error",
]


def write_artifact(directory: Path, rows: list[dict[str, str]]) -> None:
    urls = directory / "url-inventory.csv"
    metadata = directory / "metadata-inventory.csv"
    for path, fields in ((urls, ["source_domain", "sitemap_source", "url", "url_type"]), (metadata, FIELDS)):
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)


class CrawlArtifactComparisonTests(unittest.TestCase):
    def test_crawler_csv_writer_uses_lf_line_endings(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "inventory.csv"
            write_csv(path, [{"url": "https://example.test/a"}], ["url"])
            self.assertNotIn(b"\r\n", path.read_bytes())

    def test_removed_url_blocks_promotion_and_reports_metadata_drift(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline = root / "baseline"
            current = root / "current"
            baseline.mkdir()
            current.mkdir()
            common = {
                "source_domain": "makler-realty.com",
                "sitemap_source": "https://makler-realty.com/sitemap.html",
                "url_type": "listing",
                "status": "200",
                "final_url": "",
                "title": "Title",
                "meta_description": "Description",
                "canonical": "",
                "robots_meta": "",
                "hreflang": "",
                "h1": "Heading",
                "word_count": "100",
                "image_count": "2",
                "schema_present": "no",
                "error": "",
            }
            write_artifact(
                baseline,
                [
                    {**common, "url": "https://example.test/a"},
                    {**common, "url": "https://example.test/removed"},
                ],
            )
            write_artifact(
                current,
                [
                    {**common, "url": "https://example.test/a", "h1": "Updated heading"},
                    {**common, "url": "https://example.test/added"},
                ],
            )

            delta = build_delta(baseline, current)

            self.assertFalse(delta["promotion_safe"])
            self.assertEqual(delta["removed_urls"], ["https://example.test/removed"])
            self.assertEqual(delta["added_urls"], ["https://example.test/added"])
            self.assertEqual(delta["metadata_change_counts"]["h1"], 1)
            self.assertEqual(delta["current_failures"], [])
            rendered = markdown(delta)
            self.assertIn("Do not replace the launch baseline automatically", rendered)
            self.assertIn("https://example.test/removed", rendered)
            self.assertIn("homepage/search redirect", rendered)


if __name__ == "__main__":
    unittest.main()
