from __future__ import annotations

import hashlib
import json
import os
import socket
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from urllib.request import ProxyHandler, build_opener
from unittest.mock import MagicMock, patch

from migration import crawl_inventory


class _CrawlerHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self.server.requests.append(
            {
                "path": self.path,
                "authorization": self.headers.get("Authorization"),
            }
        )
        if self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "/page")
            self.end_headers()
            return
        if self.path == "/page":
            body = b"<html><title>Crawler page</title></html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/v1/sitemap?"):
            body = json.dumps({"urls": ["https://example.test/listing"]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)

    def log_message(self, format: str, *args: object) -> None:
        pass


class CrawlerIPv4OpenerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _CrawlerHandler)
        self.server.requests = []
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_port
        self.resolution_families: list[int] = []

    def tearDown(self) -> None:
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()

    def local_ipv4_opener(self):
        return build_opener(
            ProxyHandler({}),
            crawl_inventory._IPv4HTTPHandler(),
            crawl_inventory._IPv4HTTPSHandler(),
        )

    def resolver(self, host: str, port: int, family: int = 0, type: int = 0, proto: int = 0, flags: int = 0):
        self.assertEqual(host, "crawler.test")
        self.assertEqual(family, socket.AF_INET)
        self.assertEqual(type, socket.SOCK_STREAM)
        self.resolution_families.append(family)
        return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("127.0.0.1", port))]

    def test_fetch_uses_ipv4_opener_and_follows_redirects(self) -> None:
        with (
            patch.object(crawl_inventory, "IPV4_OPENER", self.local_ipv4_opener()),
            patch.object(crawl_inventory.socket, "getaddrinfo", side_effect=self.resolver),
        ):
            result = crawl_inventory.fetch(f"http://crawler.test:{self.port}/redirect", timeout=2)

        self.assertEqual(result.status, 200)
        self.assertEqual(result.error, "")
        self.assertEqual(result.final_url, f"http://crawler.test:{self.port}/page")
        self.assertIn("Crawler page", result.body)
        self.assertEqual(self.resolution_families, [socket.AF_INET, socket.AF_INET])

    def test_context_get_json_uses_ipv4_opener(self) -> None:
        with (
            patch.dict(os.environ, {"CONTEXT_DEV_API_KEY": "test-token"}),
            patch.object(crawl_inventory, "CONTEXT_BASE_URL", f"http://crawler.test:{self.port}/v1"),
            patch.object(crawl_inventory, "IPV4_OPENER", self.local_ipv4_opener()),
            patch.object(crawl_inventory.socket, "getaddrinfo", side_effect=self.resolver),
        ):
            payload = crawl_inventory.context_get_json("/sitemap", {"domain": "example.test"}, timeout=2)

        self.assertEqual(payload, {"urls": ["https://example.test/listing"]})
        request = self.server.requests[-1]
        self.assertEqual(urlparse(request["path"]).path, "/v1/sitemap")
        self.assertEqual(parse_qs(urlparse(request["path"]).query), {"domain": ["example.test"]})
        self.assertEqual(request["authorization"], "Bearer test-token")
        self.assertEqual(self.resolution_families, [socket.AF_INET])

    def test_https_connection_keeps_sni_when_resolving_ipv4(self) -> None:
        context = MagicMock()
        raw_socket = MagicMock()
        connection = crawl_inventory._IPv4HTTPSConnection("crawler.test", context=context)
        with patch.object(connection, "_create_connection", return_value=raw_socket):
            connection.connect()

        context.wrap_socket.assert_called_once_with(raw_socket, server_hostname="crawler.test")


class CrawlerContentCaptureTests(unittest.TestCase):
    def test_page_parser_prefers_primary_content_and_hashes_preserved_text(self) -> None:
        parser = crawl_inventory.PageParser("https://example.test/article")
        parser.feed(
            "<html><body><nav>Navigation text</nav>"
            "<div class='post_content_default'><h1>Article heading</h1>"
            "<p>Keep this paragraph.</p><script>ignoreThis()</script>"
            "<p>And this detail.</p></div><footer>Footer text</footer></body></html>"
        )

        record = parser.record()

        self.assertEqual(record["content_scope"], "class:post_content_default")
        self.assertEqual(record["content_text"], "Article heading Keep this paragraph. And this detail.")
        self.assertEqual(record["content_word_count"], 8)
        self.assertEqual(
            record["content_sha256"],
            hashlib.sha256(record["content_text"].encode("utf-8")).hexdigest(),
        )


if __name__ == "__main__":
    unittest.main()
