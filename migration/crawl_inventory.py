#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html
import http.client
import json
import os
import re
import socket
import sys
import time
from collections import Counter, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import HTTPHandler, HTTPSHandler, Request, build_opener


SEEDS = (
    ("makler-realty.com", "https://makler-realty.com/sitemap.html"),
    ("makler-realty.ru", "https://makler-realty.ru/sitemap_index.xml"),
)
USER_AGENT = "MSRealtyMigrationCrawler/1.0 (+local migration inventory)"
DEFAULT_WORKERS = 8
DEFAULT_TIMEOUT = 25
MAX_INTERNAL_LINKS = 120
CONTEXT_BASE_URL = "https://api.context.dev/v1"


def _create_ipv4_connection(
    address: tuple[str, int],
    timeout: object = socket._GLOBAL_DEFAULT_TIMEOUT,
    source_address: tuple[str, int] | None = None,
) -> socket.socket:
    host, port = address
    last_error: OSError | None = None
    for family, socktype, proto, _, sockaddr in socket.getaddrinfo(
        host, port, family=socket.AF_INET, type=socket.SOCK_STREAM
    ):
        sock: socket.socket | None = None
        try:
            sock = socket.socket(family, socktype, proto)
            if timeout is not socket._GLOBAL_DEFAULT_TIMEOUT:
                sock.settimeout(timeout)
            if source_address:
                sock.bind(source_address)
            sock.connect(sockaddr)
            return sock
        except OSError as exc:
            last_error = exc
            if sock is not None:
                sock.close()
    if last_error is not None:
        raise last_error
    raise OSError("getaddrinfo returns an empty list")


class _IPv4HTTPConnection(http.client.HTTPConnection):
    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)
        self._create_connection = _create_ipv4_connection


class _IPv4HTTPSConnection(http.client.HTTPSConnection):
    # Keep HTTPSConnection.connect so TLS wrapping retains its standard SNI behavior.
    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)
        self._create_connection = _create_ipv4_connection


class _IPv4HTTPHandler(HTTPHandler):
    def http_open(self, req: Request):
        return self.do_open(_IPv4HTTPConnection, req)


class _IPv4HTTPSHandler(HTTPSHandler):
    def https_open(self, req: Request):
        return self.do_open(_IPv4HTTPSConnection, req, context=self._context)


IPV4_OPENER = build_opener(_IPv4HTTPHandler(), _IPv4HTTPSHandler())


@dataclass
class FetchResult:
    url: str
    final_url: str = ""
    status: int = 0
    content_type: str = ""
    body: str = ""
    error: str = ""


@dataclass
class PageRecord:
    source_domain: str
    sitemap_source: str
    url: str
    url_type: str
    status: int = 0
    final_url: str = ""
    title: str = ""
    meta_description: str = ""
    canonical: str = ""
    robots_meta: str = ""
    hreflang: str = ""
    h1: str = ""
    word_count: int = 0
    image_count: int = 0
    internal_link_count: int = 0
    internal_links: str = ""
    open_graph: str = ""
    schema_present: bool = False
    error: str = ""
    images: list[dict[str, str]] = field(default_factory=list)


class SitemapHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        attr = dict(attrs)
        href = attr.get("href")
        if href:
            self.links.append(html.unescape(href.strip()))


class PageParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.title = ""
        self.meta_description = ""
        self.robots_meta = ""
        self.canonical = ""
        self.hreflangs: list[str] = []
        self.h1 = ""
        self.images: list[dict[str, str]] = []
        self.internal_links: set[str] = set()
        self.open_graph: dict[str, str] = {}
        self.schema_present = False
        self.text_parts: list[str] = []
        self._in_title = False
        self._in_h1 = False
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attr = {k.lower(): (v or "") for k, v in attrs}

        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1

        if tag == "title":
            self._in_title = True
        elif tag == "h1":
            self._in_h1 = True
        elif tag == "meta":
            name = attr.get("name", "").lower()
            prop = attr.get("property", "").lower()
            content = clean_space(attr.get("content", ""))
            if name == "description" and not self.meta_description:
                self.meta_description = content
            elif name == "robots" and not self.robots_meta:
                self.robots_meta = content
            elif prop.startswith("og:") and content:
                self.open_graph[prop] = content
        elif tag == "link":
            rel = {part.strip().lower() for part in attr.get("rel", "").split()}
            href = attr.get("href", "").strip()
            if "canonical" in rel and href and not self.canonical:
                self.canonical = absolutize(self.base_url, href)
            if "alternate" in rel and href and attr.get("hreflang"):
                self.hreflangs.append(
                    f"{attr.get('hreflang')}={absolutize(self.base_url, href)}"
                )
        elif tag == "img":
            src = attr.get("src") or attr.get("data-src") or attr.get("data-lazy-src")
            if src:
                self.images.append(
                    {
                        "image_url": absolutize(self.base_url, src),
                        "alt": clean_space(attr.get("alt", "")),
                        "width": attr.get("width", ""),
                        "height": attr.get("height", ""),
                    }
                )
        elif tag == "a":
            href = attr.get("href", "").strip()
            if href:
                full = absolutize(self.base_url, href)
                if is_internal(self.base_url, full):
                    self.internal_links.add(strip_fragment(full))
        elif tag == "script":
            if "ld+json" in attr.get("type", "").lower():
                self.schema_present = True

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "noscript"} and self._skip_depth:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag == "h1":
            self._in_h1 = False

    def handle_data(self, data: str) -> None:
        text = clean_space(data)
        if not text:
            return
        if self._in_title and not self.title:
            self.title = text
        elif self._in_h1 and not self.h1:
            self.h1 = text
        elif self._skip_depth == 0:
            self.text_parts.append(text)

    def record(self) -> dict[str, object]:
        words = re.findall(r"\w+", " ".join(self.text_parts), flags=re.UNICODE)
        internal_links = sorted(self.internal_links)
        return {
            "title": self.title,
            "meta_description": self.meta_description,
            "canonical": self.canonical,
            "robots_meta": self.robots_meta,
            "hreflang": "|".join(self.hreflangs),
            "h1": self.h1,
            "word_count": len(words),
            "image_count": len(self.images),
            "images": self.images,
            "internal_link_count": len(internal_links),
            "internal_links": "|".join(internal_links[:MAX_INTERNAL_LINKS]),
            "open_graph": json.dumps(self.open_graph, ensure_ascii=False, sort_keys=True),
            "schema_present": self.schema_present,
        }


def clean_space(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def absolutize(base_url: str, href: str) -> str:
    return urljoin(base_url, html.unescape(href.strip()))


def strip_fragment(url: str) -> str:
    parsed = urlparse(url)
    return parsed._replace(fragment="").geturl()


def same_domain_or_subdomain(host: str, domain: str) -> bool:
    host = host.lower().removeprefix("www.")
    domain = domain.lower().removeprefix("www.")
    return host == domain or host.endswith("." + domain)


def is_internal(base_url: str, target_url: str) -> bool:
    return same_domain_or_subdomain(urlparse(target_url).netloc, urlparse(base_url).netloc)


def fetch(url: str, timeout: int = DEFAULT_TIMEOUT) -> FetchResult:
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xml;q=0.9,*/*;q=0.5"})
    try:
        with IPV4_OPENER.open(req, timeout=timeout) as res:
            raw = res.read()
            content_type = res.headers.get("content-type", "")
            charset = res.headers.get_content_charset() or "utf-8"
            return FetchResult(
                url=url,
                final_url=res.geturl(),
                status=getattr(res, "status", 200),
                content_type=content_type,
                body=raw.decode(charset, errors="replace"),
            )
    except HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        return FetchResult(
            url=url,
            final_url=exc.geturl() or url,
            status=exc.code,
            content_type=exc.headers.get("content-type", "") if exc.headers else "",
            body=body,
            error=f"HTTP {exc.code}",
        )
    except (URLError, TimeoutError, OSError) as exc:
        return FetchResult(url=url, final_url=url, error=str(exc))


def context_get_json(path: str, params: dict[str, object], timeout: int) -> dict[str, object]:
    api_key = os.environ.get("CONTEXT_DEV_API_KEY")
    if not api_key:
        raise RuntimeError("CONTEXT_DEV_API_KEY is not set")
    url = f"{CONTEXT_BASE_URL}{path}?{urlencode(params)}"
    req = Request(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    with IPV4_OPENER.open(req, timeout=timeout) as res:
        raw = res.read()
        charset = res.headers.get_content_charset() or "utf-8"
        return json.loads(raw.decode(charset, errors="replace"))


def xml_locs(body: str) -> list[str]:
    return [html.unescape(match).strip() for match in re.findall(r"<loc>\s*(.*?)\s*</loc>", body, flags=re.I | re.S)]


def html_links(seed_url: str, body: str) -> list[str]:
    parser = SitemapHTMLParser()
    parser.feed(body)
    return [absolutize(seed_url, href) for href in parser.links]


def looks_like_sitemap(url: str, content_type: str = "") -> bool:
    path = urlparse(url).path.lower()
    return "sitemap" in path or path.endswith(".xml") or "xml" in content_type.lower()


def discover(seed_domain: str, seed_url: str, timeout: int) -> tuple[list[dict[str, str]], list[str]]:
    queue: deque[tuple[str, str]] = deque([(seed_url, seed_url)])
    seen_sitemaps: set[str] = set()
    urls: dict[str, dict[str, str]] = {}
    errors: list[str] = []

    while queue:
        sitemap_url, parent = queue.popleft()
        if sitemap_url in seen_sitemaps:
            continue
        seen_sitemaps.add(sitemap_url)
        result = fetch(sitemap_url, timeout=timeout)
        if result.error and not result.body:
            errors.append(f"{sitemap_url}: {result.error}")
            continue

        locs = xml_locs(result.body)
        if not locs and "html" in result.content_type.lower():
            locs = html_links(result.final_url or sitemap_url, result.body)

        for loc in locs:
            full = strip_fragment(absolutize(result.final_url or sitemap_url, loc))
            host = urlparse(full).netloc
            if not same_domain_or_subdomain(host, seed_domain):
                continue
            if looks_like_sitemap(full):
                queue.append((full, sitemap_url))
            else:
                urls.setdefault(
                    full,
                    {
                        "source_domain": seed_domain,
                        "sitemap_source": sitemap_url,
                        "url": full,
                        "url_type": classify_url(full, sitemap_url),
                    },
                )

    return sorted(urls.values(), key=lambda row: row["url"]), errors


def context_discover(seed_domain: str, timeout: int) -> tuple[list[dict[str, str]], list[str]]:
    try:
        payload = context_get_json(
            "/web/scrape/sitemap",
            {"domain": seed_domain, "maxLinks": 100000, "timeoutMS": timeout * 1000},
            timeout=timeout + 10,
        )
    except Exception as exc:
        return [], [f"context.dev sitemap {seed_domain}: {exc}"]

    rows = []
    for url in payload.get("urls", []) or []:
        if not isinstance(url, str):
            continue
        full = strip_fragment(url)
        if same_domain_or_subdomain(urlparse(full).netloc, seed_domain):
            rows.append(
                {
                    "source_domain": seed_domain,
                    "sitemap_source": "context.dev:/web/scrape/sitemap",
                    "url": full,
                    "url_type": classify_url(full, "context.dev:/web/scrape/sitemap"),
                }
            )
    return sorted(rows, key=lambda row: row["url"]), []


def classify_url(url: str, sitemap_source: str) -> str:
    source = urlparse(sitemap_source).path.lower()
    path = urlparse(url).path.lower().strip("/")

    if not path or path in {"en", "de", "nl", "ru"}:
        return "page"
    if path in {"listing", "listings"}:
        return "taxonomy"
    if any(token in path for token in ("feed", "wp-json", "xmlrpc", "wp-admin")):
        return "technical"
    if any(token in source for token in ("listings", "listing", "properties", "estate")):
        return "listing"
    if any(token in source for token in ("category", "post_tag", "resort", "location", "floors", "property", "type")):
        return "taxonomy"
    if "post" in source:
        return "post"
    if "page" in source:
        return "page"
    if re.search(r"/(property|listing|imot|imoti|nedvizhimost|estate)[-/]", "/" + path + "/"):
        return "listing"
    if any(token in path for token in ("category", "tag", "resort", "location", "type", "floor")):
        return "taxonomy"
    return "page"


def crawl_page(row: dict[str, str], timeout: int) -> PageRecord:
    result = fetch(row["url"], timeout=timeout)
    record = PageRecord(
        source_domain=row["source_domain"],
        sitemap_source=row["sitemap_source"],
        url=row["url"],
        url_type=row["url_type"],
        status=result.status,
        final_url=result.final_url,
        error=result.error,
    )

    if result.body and "html" in result.content_type.lower():
        parser = PageParser(result.final_url or row["url"])
        parser.feed(result.body)
        parsed = parser.record()
        for key, value in parsed.items():
            setattr(record, key, value)
    elif result.body and result.status and not result.error:
        record.error = f"Non-HTML content type: {result.content_type}"

    return record


def write_csv(path: Path, rows: Iterable[dict[str, object]], fields: list[str]) -> int:
    count = 0
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
            count += 1
    return count


def page_to_dict(record: PageRecord) -> dict[str, object]:
    return {
        "source_domain": record.source_domain,
        "sitemap_source": record.sitemap_source,
        "url": record.url,
        "url_type": record.url_type,
        "status": record.status,
        "final_url": record.final_url,
        "title": record.title,
        "meta_description": record.meta_description,
        "canonical": record.canonical,
        "robots_meta": record.robots_meta,
        "hreflang": record.hreflang,
        "h1": record.h1,
        "word_count": record.word_count,
        "image_count": record.image_count,
        "internal_link_count": record.internal_link_count,
        "internal_links": record.internal_links,
        "open_graph": record.open_graph,
        "schema_present": "yes" if record.schema_present else "no",
        "error": record.error,
    }


def media_rows(records: list[PageRecord]) -> Iterable[dict[str, object]]:
    for record in records:
        for image in record.images:
            yield {
                "source_domain": record.source_domain,
                "page_url": record.url,
                "page_type": record.url_type,
                "image_url": image.get("image_url", ""),
                "alt": image.get("alt", ""),
                "width": image.get("width", ""),
                "height": image.get("height", ""),
            }


def redirect_rows(records: list[PageRecord]) -> Iterable[dict[str, object]]:
    for record in records:
        if record.status in {404, 410} or record.error:
            new_url = ""
            status = "review_required"
            reason = "Fetch failed or URL is already gone; map to closest equivalent or approve 410."
        elif "noindex" in record.robots_meta.lower() or record.url_type == "technical":
            new_url = ""
            status = "noindex_or_technical_review"
            reason = "Preserve only if intentionally indexable; otherwise keep excluded."
        else:
            new_url = record.final_url or record.url
            status = "200_candidate"
            reason = "Default preservation candidate; verify equivalent migrated content before launch."
        yield {
            "old_url": record.url,
            "new_url": new_url,
            "status": status,
            "reason": reason,
            "url_type": record.url_type,
            "source_domain": record.source_domain,
        }


def write_summary(path: Path, records: list[PageRecord], sitemap_errors: list[str], elapsed: float, context_available: bool) -> None:
    by_domain = Counter(r.source_domain for r in records)
    by_status = Counter(str(r.status or "fetch_error") for r in records)
    by_type = Counter(r.url_type for r in records)
    failures = [r for r in records if r.error or not r.status or r.status >= 400]
    missing_title = sum(1 for r in records if r.status and r.status < 400 and not r.title)
    missing_meta = sum(1 for r in records if r.status and r.status < 400 and not r.meta_description)
    missing_h1 = sum(1 for r in records if r.status and r.status < 400 and not r.h1)
    no_schema = sum(1 for r in records if r.status and r.status < 400 and not r.schema_present)
    zero_images = sum(1 for r in records if r.status and r.status < 400 and r.image_count == 0)
    homepage_targets = sum(
        1
        for row in redirect_rows(records)
        if row["old_url"] != row["new_url"]
        and row["new_url"] in {"https://makler-realty.com/", "https://makler-realty.ru/"}
    )

    lines = [
        "# MS Realty Crawl Summary",
        "",
        f"- Generated: {datetime.now().isoformat(timespec='seconds')}",
        f"- Duration: {elapsed:.1f}s",
        f"- Context.dev API key detected: {'yes' if context_available else 'no'}",
        f"- Total crawled URLs: {len(records)}",
        f"- Sitemap discovery errors: {len(sitemap_errors)}",
        f"- Fetch failures / blocked / 4xx+: {len(failures)}",
        f"- Homepage redirect-map targets generated: {homepage_targets}",
        "",
        "## Counts By Domain",
        "",
    ]
    lines += [f"- {key}: {value}" for key, value in sorted(by_domain.items())]
    lines += ["", "## Counts By Status", ""]
    lines += [f"- {key}: {value}" for key, value in sorted(by_status.items())]
    lines += ["", "## Counts By Type", ""]
    lines += [f"- {key}: {value}" for key, value in sorted(by_type.items())]
    lines += [
        "",
        "## Metadata Gaps",
        "",
        f"- Missing title: {missing_title}",
        f"- Missing meta description: {missing_meta}",
        f"- Missing H1: {missing_h1}",
        f"- No schema detected: {no_schema}",
        f"- Zero images detected: {zero_images}",
        "",
        "## Mapping Guardrail",
        "",
        "The draft redirect map does not bulk-map old URLs to the homepage or search page.",
        "Indexable URLs are marked as `200_candidate` by default so equivalent content can be preserved at the same URL unless the future platform route requires a reviewed one-hop 301.",
        "",
        "## Next Risks",
        "",
        "- Review failed and blocked URLs manually before deciding any 410s.",
        "- Join Search Console, Yandex Webmaster, backlink, and analytics landing-page data before final redirect decisions.",
        "- Confirm Russian `.ru` URLs remain first-class Russian routes unless a separate consolidation decision is made.",
        "- Validate migrated staging against this inventory before launch.",
    ]
    if sitemap_errors:
        lines += ["", "## Sitemap Discovery Errors", ""]
        lines += [f"- {err}" for err in sitemap_errors[:100]]
    if failures:
        lines += ["", "## First Fetch Failures", ""]
        for r in failures[:100]:
            lines.append(f"- {r.url} :: status={r.status or 'n/a'} :: {r.error}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def output_dir(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return Path("migration") / "artifacts" / stamp


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export MS Realty migration crawl inventory.")
    parser.add_argument("--limit", type=int, default=0, help="Limit pages crawled after sitemap discovery.")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Concurrent page fetches.")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="Per-request timeout seconds.")
    parser.add_argument("--output-dir", default="", help="Output directory. Defaults to migration/artifacts/<timestamp>.")
    parser.add_argument(
        "--sitemap-provider",
        choices=("auto", "fallback", "context-dev"),
        default="auto",
        help="Use Context.dev for sitemap discovery when available, or force the stdlib fallback.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    started = time.time()
    context_available = bool(os.environ.get("CONTEXT_DEV_API_KEY"))

    all_urls: list[dict[str, str]] = []
    sitemap_errors: list[str] = []
    for domain, seed in SEEDS:
        if args.sitemap_provider in {"auto", "context-dev"} and context_available:
            rows, errors = context_discover(domain, args.timeout)
            if not rows and args.sitemap_provider == "auto":
                fallback_rows, fallback_errors = discover(domain, seed, args.timeout)
                rows.extend(fallback_rows)
                errors.extend(fallback_errors)
        else:
            rows, errors = discover(domain, seed, args.timeout)
        all_urls.extend(rows)
        sitemap_errors.extend(errors)

    deduped = {row["url"]: row for row in all_urls}
    all_urls = sorted(deduped.values(), key=lambda row: (row["source_domain"], row["url"]))
    crawl_urls = all_urls[: args.limit] if args.limit else all_urls

    records: list[PageRecord] = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(crawl_page, row, args.timeout) for row in crawl_urls]
        for future in as_completed(futures):
            records.append(future.result())
    records.sort(key=lambda r: (r.source_domain, r.url))

    out = output_dir(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)

    url_fields = ["source_domain", "sitemap_source", "url", "url_type"]
    metadata_fields = [
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
        "internal_link_count",
        "internal_links",
        "open_graph",
        "schema_present",
        "error",
    ]
    media_fields = ["source_domain", "page_url", "page_type", "image_url", "alt", "width", "height"]
    redirect_fields = ["old_url", "new_url", "status", "reason", "url_type", "source_domain"]

    write_csv(out / "url-inventory.csv", all_urls, url_fields)
    write_csv(out / "metadata-inventory.csv", (page_to_dict(r) for r in records), metadata_fields)
    write_csv(out / "media-inventory.csv", media_rows(records), media_fields)
    write_csv(out / "redirect-map-draft.csv", redirect_rows(records), redirect_fields)
    write_summary(out / "crawl-summary.md", records, sitemap_errors, time.time() - started, context_available)

    print(f"discovered_urls={len(all_urls)}")
    print(f"crawled_urls={len(records)}")
    print(f"output_dir={out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
