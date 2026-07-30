from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.robotparser import RobotFileParser

from migration import capture_content, crawl_inventory


def policy(lines: list[str]) -> capture_content.RobotsPolicy:
    parser = RobotFileParser()
    parser.set_url("https://example.test/robots.txt")
    parser.parse(lines)
    return capture_content.RobotsPolicy(
        robots_url="https://example.test/robots.txt",
        status=200,
        parser=parser,
    )


class ContentCaptureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.row = {
            "source_domain": "example.test",
            "url": "https://example.test/article",
            "url_type": "page",
        }

    def test_capture_page_respects_robots_and_preserves_primary_content(self) -> None:
        allowed = policy(["User-agent: *", "Disallow: /blocked"])
        fetch_result = crawl_inventory.FetchResult(
            url=self.row["url"],
            final_url=self.row["url"],
            status=200,
            content_type="text/html; charset=utf-8",
            body="<html><body><nav>Navigation</nav><div class='post_content'><h1>Source heading</h1><p>Source copy.</p></div></body></html>",
        )
        with patch.object(capture_content, "fetch", return_value=fetch_result) as mocked_fetch:
            content, skipped = capture_content.capture_page(self.row, allowed, 2, "2026-07-29T12:00:00+00:00")

        self.assertIsNone(skipped)
        self.assertEqual(content["content_scope"], "class:post_content")
        self.assertEqual(content["extracted_body_text"], "Source heading Source copy.")
        self.assertEqual(content["extractor"], "html-primary-content-v1")
        self.assertEqual(content["text_sha256"], capture_content.sha256_text("Source heading Source copy."))
        mocked_fetch.assert_called_once_with(self.row["url"], timeout=2)

        blocked_row = {**self.row, "url": "https://example.test/blocked/page"}
        with patch.object(capture_content, "fetch") as blocked_fetch:
            content, skipped = capture_content.capture_page(blocked_row, allowed, 2, "2026-07-29T12:00:00+00:00")

        self.assertIsNone(content)
        self.assertEqual(skipped["reason"], "robots_disallowed")
        blocked_fetch.assert_not_called()

    def test_evidence_manifest_hashes_files_and_refuses_overwrite(self) -> None:
        contents = [{"source_domain": "example.test", "url": self.row["url"], "extracted_body_text": "Source copy."}]
        skipped = [{"source_domain": "example.test", "url": "https://example.test/blocked", "url_type": "page", "status": 200, "final_url": "", "reason": "robots_disallowed", "detail": "https://example.test/robots.txt"}]
        policies = {("https", "example.test"): policy(["User-agent: *"])}

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_inventory = root / "url-inventory.csv"
            source_inventory.write_text("source_domain,url,url_type\nexample.test,https://example.test/article,page\n", encoding="utf-8")
            output_dir = root / "evidence"
            capture_content.prepare_output_dir(output_dir)
            manifest = capture_content.write_evidence(
                output_dir,
                source_inventory,
                contents,
                skipped,
                policies,
                "2026-07-29T12:00:00+00:00",
            )

            persisted = json.loads((output_dir / "content-evidence-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["counts"], {"source_urls": 2, "captured": 1, "skipped": 1})
            self.assertEqual(persisted["files"]["content-inventory.jsonl"]["rows"], 1)
            self.assertTrue(persisted["files"]["content-capture-skipped.csv"]["sha256"])
            with self.assertRaises(FileExistsError):
                capture_content.prepare_output_dir(output_dir)


if __name__ == "__main__":
    unittest.main()
