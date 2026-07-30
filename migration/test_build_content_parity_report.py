from __future__ import annotations

import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from migration.build_content_parity_report import build_report, write_report


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_csv(path: Path, fields: list[str], rows: list[dict[str, object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def write_fixture(root: Path) -> dict[str, Path]:
    crawl = root / "url-inventory.csv"
    evidence = root / "evidence"
    evidence.mkdir()
    route_map = root / "route-map.json"
    approved = root / "approved-cms-content.json"
    seed = root / "cms-seed.json"
    urls = {
        "used": "https://example.test/used%20source",
        "seeded": "https://example.test/seeded",
        "robots": "https://example.test/robots",
        "missing": "https://example.test/missing",
        "not_found": "https://example.test/not-found",
    }
    crawl_rows = [
        {"source_domain": "example.test", "url": urls["used"], "url_type": "listing"},
        {"source_domain": "example.test", "url": urls["seeded"], "url_type": "page"},
        {"source_domain": "example.test", "url": urls["robots"], "url_type": "taxonomy"},
        {"source_domain": "example.test", "url": urls["missing"], "url_type": "page"},
        {"source_domain": "example.test", "url": urls["not_found"], "url_type": "post"},
    ]
    write_csv(crawl, ["source_domain", "url", "url_type"], crawl_rows)
    used_text = "Approved legacy source text."
    captured = [
        {
            "source_domain": "example.test",
            "url": urls["used"],
            "url_type": "listing",
            "status": 200,
            "text_sha256": hashlib.sha256(used_text.encode("utf-8")).hexdigest(),
            "content_word_count": 4,
            "extracted_body_text": used_text,
        },
        {
            "source_domain": "example.test",
            "url": urls["seeded"],
            "url_type": "page",
            "status": 200,
            "text_sha256": hashlib.sha256(b"Seeded source text.").hexdigest(),
            "content_word_count": 3,
            "extracted_body_text": "Seeded source text.",
        },
    ]
    content_path = evidence / "content-inventory.jsonl"
    content_path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in captured),
        encoding="utf-8",
    )
    skipped = [
        {
            "source_domain": "example.test",
            "url": urls["robots"],
            "url_type": "taxonomy",
            "status": 200,
            "final_url": "",
            "reason": "robots_disallowed",
            "detail": "https://example.test/robots.txt",
        },
        {
            "source_domain": "example.test",
            "url": urls["not_found"],
            "url_type": "post",
            "status": 404,
            "final_url": urls["not_found"],
            "reason": "fetch_failed",
            "detail": "HTTP 404",
        },
    ]
    skipped_path = evidence / "content-capture-skipped.csv"
    write_csv(
        skipped_path,
        ["source_domain", "url", "url_type", "status", "final_url", "reason", "detail"],
        skipped,
    )
    manifest = {
        "schema_version": 1,
        "counts": {"source_urls": 4, "captured": 2, "skipped": 2},
        "source_inventory": {"sha256": sha256(crawl)},
        "files": {
            "content-inventory.jsonl": {"sha256": sha256(content_path), "rows": 2},
            "content-capture-skipped.csv": {"sha256": sha256(skipped_path), "rows": 2},
        },
    }
    (evidence / "content-evidence-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    route_map.write_text(
        json.dumps(
            {
                "routes": [
                    {
                        "old_url": urls["used"],
                        "source_domain": "example.test",
                        "url_type": "listing",
                        "target_path": "/bg/imoti/1",
                        "planned_status": 301,
                        "deployable": False,
                        "review_required": True,
                    },
                    {
                        "old_url": urls["seeded"],
                        "source_domain": "example.test",
                        "url_type": "page",
                        "target_path": "/bg/guides/seeded",
                        "planned_status": 301,
                        "deployable": False,
                        "review_required": True,
                    },
                    *[
                        {
                            "old_url": urls[name],
                            "source_domain": "example.test",
                            "url_type": url_type,
                            "target_path": None,
                            "planned_status": None,
                            "deployable": False,
                            "review_required": True,
                        }
                        for name, url_type in (("robots", "taxonomy"), ("missing", "page"), ("not_found", "post"))
                    ],
                ]
            }
        ),
        encoding="utf-8",
    )
    approved.write_text(
        json.dumps(
            {
                "documents": [
                    {
                        "id": "approved-used",
                        "type": "guide",
                        "status": "approved",
                        "human_approved": True,
                        "legacy_migration": True,
                        "source_url": "https://example.test/used%20source",
                        "source_text_sha256": captured[0]["text_sha256"],
                    },
                    {
                        "id": "legacy-unlinked",
                        "type": "guide",
                        "status": "approved",
                        "human_approved": True,
                        "legacy_migration": True,
                    },
                ]
            }
        ),
        encoding="utf-8",
    )
    seed.write_text(
        json.dumps(
            {
                "records": [
                    {
                        "id": "seeded-record",
                        "source_url": urls["seeded"],
                        "cms_status": "source_imported_review_required",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    return {
        "crawl": crawl,
        "evidence": evidence,
        "route_map": route_map,
        "approved": approved,
        "seed": seed,
        "urls": urls,
    }


class ContentParityReportTests(unittest.TestCase):
    def build(self, fixture: dict[str, Path]) -> dict:
        return build_report(
            crawl_inventory_path=fixture["crawl"],
            evidence_dir=fixture["evidence"],
            route_map_path=fixture["route_map"],
            approved_cms_content_path=fixture["approved"],
            cms_seed_path=fixture["seed"],
            focus_source_domain="example.test",
            generated_at_utc="2026-07-30T12:00:00+00:00",
        )

    def test_joins_exact_statuses_and_keeps_seeded_content_non_publishing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = write_fixture(Path(directory))
            report = self.build(fixture)

            rows = {row["url"]: row for row in report["urls"]}
            urls = fixture["urls"]
            self.assertTrue(report["integrity"]["content_evidence_manifest"]["valid"])
            self.assertEqual(rows[urls["used"]]["content_status"], "used")
            self.assertEqual(rows[urls["seeded"]]["content_status"], "seeded_for_review")
            self.assertEqual(rows[urls["robots"]]["content_status"], "robots")
            self.assertEqual(rows[urls["not_found"]]["content_status"], "404")
            self.assertEqual(rows[urls["missing"]]["content_status"], "unavailable")
            self.assertEqual(rows[urls["seeded"]]["route"]["mapping_state"], "mapped_for_review")
            self.assertEqual(rows[urls["robots"]]["route"]["mapping_state"], "unresolved_review_required")
            self.assertEqual(
                report["summary"]["all_sources"]["content_statuses"],
                {"404": 1, "robots": 1, "seeded_for_review": 1, "unavailable": 1, "used": 1},
            )
            self.assertEqual(report["summary"]["approved_cms"]["legacy_marked_documents_without_direct_legacy_url"], 1)
            self.assertEqual(report["summary"]["cms_seed"]["captured_seeded_for_review"], 1)

            output_json = fixture["evidence"] / "report.json"
            output_markdown = fixture["evidence"] / "report.md"
            write_report(report, output_json, output_markdown)
            persisted = json.loads(output_json.read_text(encoding="utf-8"))
            self.assertEqual(persisted["urls"][0]["capture"]["state"], "unavailable")
            self.assertNotIn("extracted_body_text", output_json.read_text(encoding="utf-8"))
            self.assertIn("not public usage", output_markdown.read_text(encoding="utf-8"))

    def test_manifest_mismatch_is_reported_without_hiding_url_disposition(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = write_fixture(Path(directory))
            content_path = fixture["evidence"] / "content-inventory.jsonl"
            content_path.write_text(content_path.read_text(encoding="utf-8") + "\n", encoding="utf-8")

            report = self.build(fixture)

            integrity = report["integrity"]["content_evidence_manifest"]
            self.assertFalse(integrity["valid"])
            self.assertIn("content evidence manifest hash does not match content-inventory.jsonl", integrity["errors"])
            self.assertEqual(report["summary"]["all_sources"]["used"], 1)


if __name__ == "__main__":
    unittest.main()
