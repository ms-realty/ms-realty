"""Bounded public GET transport; no cookies, forms, credentials or TLS overrides."""

import base64
import json
import sys
import urllib.parse
import urllib.request


def validate(url):
    parsed = urllib.parse.urlsplit(url)
    if (
        parsed.scheme not in ("http", "https")
        or parsed.hostname not in ("makler-realty.com", "makler-realty.ru")
        or parsed.username
        or parsed.password
        or parsed.port
        or parsed.fragment
    ):
        raise ValueError("Unsupported public legacy source")


class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self):
        self.redirects = []

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate(newurl)
        if len(self.redirects) >= 5:
            raise ValueError("Source redirect limit exceeded")
        self.redirects.append({"from": req.full_url, "status": code, "to": newurl})
        return super().redirect_request(req, fp, code, msg, headers, newurl)


try:
    url = sys.argv[1]
    validate(url)
    redirects = PublicRedirect()
    opener = urllib.request.build_opener(redirects)
    request = urllib.request.Request(
        url, headers={"User-Agent": "MSRealtyLaunchReadOnlyInventory/1.0"}, method="GET"
    )
    with opener.open(request, timeout=18) as response:
        body = response.read(3_000_001)
        if len(body) > 3_000_000:
            raise ValueError("Source exceeds capture body limit")
        print(json.dumps({
            "status": response.status,
            "finalUrl": response.url,
            "charset": response.headers.get_content_charset() or "utf-8",
            "contentType": response.headers.get("Content-Type"),
            "bodyBase64": base64.b64encode(body).decode("ascii"),
            "redirects": redirects.redirects,
        }))
except Exception as error:
    print(json.dumps({"error": str(error)}))
    sys.exit(1)
