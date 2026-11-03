"""Exercise the actual ZIP and range reader without any provider requests."""

import base64
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile


spec = importlib.util.spec_from_file_location(
    "archive", Path(__file__).with_name("release-ci-archive.py")
)
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)
INDEX = "playwright-report/chromium-desktop/index.html"


def packed(entries):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w") as z, warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        for name, body in entries:
            z.writestr(name, body)
    return data.getvalue()


def html(entries):
    return (
        b'<template id="playwrightReportBase64">data:application/zip;base64,'
        + base64.b64encode(packed(entries))
        + b"</template>"
    )


class NativeReportTest(unittest.TestCase):
    def test_reads_only_exact_report_and_native_members(self):
        details = archive.FILE_ID + ".json"
        page = html([("report.json", b'{"files":[]}'), (details, b'{"tests":[]}')])
        raw = packed(
            [
                (INDEX, page),
                ("../unexpected", b"unread"),
                ("other/index.html", b"unused"),
            ]
        )
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            result = archive.read_report(io.BytesIO(raw), "chromium-desktop", out)
            self.assertEqual(
                set(p.name for p in out.iterdir()),
                {"index.html", "report.json", details},
            )
            self.assertEqual(result["member"], INDEX)
            self.assertEqual(result["sha256"]["index.html"], archive.digest(page))

    def test_missing_duplicate_malformed_and_unknown_members_fail(self):
        valid = html([("report.json", b"{}")])
        for entries in [
            [(INDEX, valid), (INDEX, valid)],
            [("other/index.html", valid)],
            [(INDEX, b"<html>passed</html>")],
            [(INDEX, html([("report.json", b"{}"), ("report.json", b"{}")]))],
            [(INDEX, html([("elsewhere/report.json", b"{}")]))],
            [
                (
                    INDEX,
                    html(
                        [
                            ("report.json", b"{}"),
                            (archive.FILE_ID + ".json", b"{}"),
                            (archive.FILE_ID + ".json", b"{}"),
                        ]
                    ),
                )
            ],
        ]:
            with (
                self.subTest(),
                tempfile.TemporaryDirectory() as d,
                self.assertRaises(ValueError),
            ):
                archive.read_report(
                    io.BytesIO(packed(entries)), "chromium-desktop", Path(d)
                )

    def test_only_transient_transport_can_retry(self):
        with patch.object(archive.time, "sleep"):
            from unittest.mock import Mock

            temporary = Mock(side_effect=[TimeoutError(), b"complete"])
            self.assertEqual(archive.retry_transport(temporary), b"complete")
            self.assertEqual(temporary.call_count, 2)
            invalid = Mock(side_effect=ValueError("invalid"))
            with self.assertRaises(ValueError):
                archive.retry_transport(invalid)
            self.assertEqual(invalid.call_count, 1)

    def test_partial_transport_requires_exact_range_object_and_size(self):
        class Response(io.BytesIO):
            status = 206

        for status, content_range, etag, size in [
            (200, "bytes 0-9/10", '"a"', 10),
            (206, "bytes 0-8/10", '"a"', 10),
            (206, "bytes 0-9/10", 'W/"a"', 10),
            (206, "bytes 0-9/10", '"changed"', 10),
            (206, "bytes 0-9/10", '"a"', 9),
        ]:
            res = Response(b"x" * size)
            res.status = status
            res.headers = {"Content-Range": content_range, "ETag": etag}
            stream = archive.ArtifactRanges("https://example.invalid", 10)
            stream.etag = '"a"'
            with (
                self.subTest(),
                patch.object(archive.http, "open", return_value=res),
                self.assertRaises(ValueError),
            ):
                stream.read(10)


if __name__ == "__main__":
    unittest.main()
