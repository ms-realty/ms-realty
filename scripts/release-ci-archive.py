"""Read only the selected Playwright native report from an Actions artifact, without extracting files."""

import argparse
import base64
import hashlib
from http.client import IncompleteRead
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler, Request
import zipfile


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


http = build_opener(NoRedirect)
MAX_MEMBER = 12 * 1024 * 1024
FILE = "shared-shortlist.spec.ts"
FILE_ID = hashlib.sha1(FILE.encode()).hexdigest()[:20]  # Playwright's file identifier


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def retry_transport(operation):
    for attempt in range(3):
        try:
            return operation()
        except HTTPError as error:
            if error.code not in (502, 503, 504) or attempt == 2:
                raise
        except (TimeoutError, ConnectionError, URLError, IncompleteRead):
            if attempt == 2:
                raise
        time.sleep(0.25 * (attempt + 1))


def blob_location(route):
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        token = (
            subprocess.check_output(
                ["gh", "auth", "token", "--hostname", "github.com"],
                timeout=10,
                stderr=subprocess.DEVNULL,
            )
            .decode()
            .strip()
        )
    url = "https://api.github.com/repos/ms-realty/ms-realty/actions/" + route
    request = Request(
        url,
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
        },
    )
    try:
        with retry_transport(lambda: http.open(request, timeout=18)):
            raise ValueError("expected artifact download redirect")
    except HTTPError as error:
        require(error.code == 302, "artifact download redirect unavailable")
        target = error.headers.get("Location", "")
        parsed = urlsplit(target)
        require(
            parsed.scheme == "https"
            and parsed.port in (None, 443)
            and not parsed.username
            and not parsed.password
            and (parsed.hostname or "").endswith(".blob.core.windows.net"),
            "unrecognized artifact storage host",
        )
        return target


class ArtifactRanges(io.RawIOBase):
    """Read a single provider-issued HTTPS blob. Never forward the repository credential."""

    def __init__(self, url, size):
        self.url, self.size, self.pos = url, size, 0
        self.cache, self.etag, self.total = [], None, 0

    def seekable(self):
        return True

    def seek(self, offset, whence=0):
        self.pos = [0, self.pos, self.size][whence] + offset
        require(0 <= self.pos <= self.size, "invalid ZIP offset")
        return self.pos

    def tell(self):
        return self.pos

    def read(self, amount=-1):
        start = self.pos
        end = self.size if amount < 0 else min(self.size, start + amount)
        self.pos = end
        if start == end:
            return b""
        for offset, data in self.cache:
            if offset <= start and end <= offset + len(data):
                return data[start - offset : end - offset]
        # ZipFile seeks repeatedly around the central directory and each local header.
        lo = (
            min(start, max(0, self.size - 128 * 1024))
            if start >= self.size - 128 * 1024
            else start
        )
        hi = min(self.size, max(end, lo + 64 * 1024))

        def read_range():
            self.total += hi - lo
            require(
                0 < hi - lo <= MAX_MEMBER and self.total <= 2 * MAX_MEMBER,
                "ZIP range budget exceeded",
            )
            headers = {"Range": f"bytes={lo}-{hi - 1}", "Accept-Encoding": "identity"}
            if self.etag:
                headers["If-Match"] = self.etag
            with http.open(Request(self.url, headers=headers), timeout=25) as response:
                require(
                    response.status == 206
                    and response.headers.get("Content-Range")
                    == f"bytes {lo}-{hi - 1}/{self.size}",
                    "incorrect artifact byte range",
                )
                current = response.headers.get("ETag", "")
                require(
                    re.fullmatch(r'"[^"]+"', current) and self.etag in (None, current),
                    "artifact object changed",
                )
                self.etag = current
                data = response.read(hi - lo + 1)
                require(len(data) == hi - lo, "truncated artifact range")
            return data

        data = retry_transport(read_range)
        self.cache.append((lo, data))
        return data[start - lo : end - lo]


def member(archive, name):
    matches = [e for e in archive.infolist() if e.filename == name]
    require(
        len(matches) == 1 and 0 < matches[0].file_size <= MAX_MEMBER,
        "missing, duplicate or oversized ZIP member",
    )
    return archive.read(
        matches[0]
    )  # also validates CRC32, which is not a whole-artifact hash


def read_report(archive, profile, directory):
    path = f"playwright-report/{profile}/index.html"
    with zipfile.ZipFile(archive) as outer:
        html = member(outer, path)
    prefix = b'<template id="playwrightReportBase64">data:application/zip;base64,'
    require(
        html.count(prefix) == 1 and html.endswith(b"</template>"),
        "unrecognized Playwright report",
    )
    payload = base64.b64decode(
        html.split(prefix)[1][: -len(b"</template>")], validate=True
    )
    with zipfile.ZipFile(io.BytesIO(payload)) as native:
        index = member(native, "report.json")
        # A report that never scheduled our file has no per-file result member.
        detail = (
            member(native, FILE_ID + ".json")
            if FILE_ID + ".json" in native.namelist()
            else None
        )
    contents = {"index.html": html, "report.json": index}
    if detail is not None:
        contents[FILE_ID + ".json"] = detail
    for name, data in contents.items():
        with (directory / name).open("xb") as out:
            out.write(data)
    return {
        "member": path,
        "sha256": {name: digest(data) for name, data in contents.items()},
    }


def main():
    parser = argparse.ArgumentParser()
    if sys.argv[1:2] == ["job-log"]:
        parser.add_argument("command", choices=["job-log"])
        parser.add_argument("job", type=int)
        args = parser.parse_args()
        require(args.job > 0, "invalid job")
        request = Request(blob_location(f"jobs/{args.job}/logs"))

        def read_log():
            with http.open(request, timeout=25) as response:
                require(response.status == 200, "job log unavailable")
                data = response.read(MAX_MEMBER + 1)
                require(0 < len(data) <= MAX_MEMBER, "invalid job log size")
                return data

        sys.stdout.buffer.write(retry_transport(read_log))
        return
    parser.add_argument("artifact", type=int)
    parser.add_argument("size", type=int)
    parser.add_argument(
        "profile", choices=["chromium-desktop", "chromium-mobile", "webkit-mobile"]
    )
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    require(
        args.artifact > 0 and 0 < args.size < 2**32, "invalid artifact identity or size"
    )
    blob = ArtifactRanges(blob_location(f"artifacts/{args.artifact}/zip"), args.size)
    report = read_report(blob, args.profile, args.directory)
    print(
        json.dumps(
            {
                **report,
                "integrityScope": "provider-range-read",
                "wholeArchiveVerified": False,
                "etag": blob.etag,
                "rangeBytesRead": blob.total,
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Network exception text can contain the signed URL. Only disclose known-safe validation messages.
        print(
            str(error)
            if type(error) is ValueError
            else f"artifact read failed ({type(error).__name__})",
            file=sys.stderr,
        )
        sys.exit(1)
