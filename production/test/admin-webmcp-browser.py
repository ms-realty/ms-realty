from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = (ROOT / "public" / "vendor" / "ms-realty-admin.js").read_text(encoding="utf-8")
CATALOG = {
    "kind": "owner_operator_catalog",
    "operator_id": "owner",
    "roles": ["admin"],
    "summary": {"total": 3, "mcp_delegated": 2, "browser_session": 1},
    "operations": [
        {
            "operation": "admin_get_listings",
            "method": "GET",
            "pathname": "/api/admin/listings",
            "read_only": True,
            "execution": "mcp_delegated",
        },
        {
            "operation": "admin_post_listings_status",
            "method": "POST",
            "pathname": "/api/admin/listings/status",
            "read_only": False,
            "execution": "mcp_delegated",
            "confirmation": {
                "kind": "signed_expiring_challenge",
                "version": "c1",
                "algorithm": "HMAC-SHA256",
                "ttl_seconds": 120,
                "binds": ["operator_id", "session_id", "operation", "input_hash"],
            },
        },
        {
            "operation": "admin_post_security_two_factor_verify",
            "method": "POST",
            "pathname": "/api/admin/security/two-factor/verify",
            "read_only": False,
            "execution": "browser_session",
            "ui_path": "/admin/settings#settings-security",
        },
    ],
}


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route(
            "https://ms-realty.test/**",
            lambda route: route.fulfill(
                status=200,
                content_type="text/html",
                body="<!doctype html><html lang='en'><head><title>Listings</title></head><body></body></html>",
            ),
        )
        page.goto("https://ms-realty.test/admin")
        page.evaluate(
            """catalog => {
              window.__webmcpTools = [];
              window.__webmcpFetches = [];
              Object.defineProperty(document, "modelContext", {
                configurable: true,
                value: {
                  registerTool: async tool => {
                    window.__webmcpTools.push(tool);
                  },
                },
              });
              window.fetch = async (url, options = {}) => {
                window.__webmcpFetches.push({ url: String(url), options });
                if (String(url).includes("catalog=1")) {
                  return { ok: true, status: 200, json: async () => catalog };
                }
                return {
                  ok: true,
                  status: 200,
                  headers: { get: () => "application/json" },
                  json: async () => ({ kind: "browser_test_result" }),
                };
              };
            }""",
            CATALOG,
        )
        page.add_script_tag(content=SCRIPT)
        page.wait_for_function("window.__webmcpTools.length === 4")

        names = page.evaluate("window.__webmcpTools.map(tool => tool.name)")
        assert names == [
            "ms_realty_admin_context",
            "ms_realty_admin_read",
            "ms_realty_admin_write",
            "ms_realty_admin_open",
        ], {"page_errors": errors, "names": names}

        annotations = page.evaluate("window.__webmcpTools.map(tool => tool.annotations)")
        assert annotations == [
            {"readOnlyHint": True},
            {"readOnlyHint": True, "untrustedContentHint": True},
            {"readOnlyHint": False, "destructiveHint": True, "untrustedContentHint": True},
            {"readOnlyHint": False, "destructiveHint": False},
        ], annotations

        browser_operation = page.evaluate(
            "window.__webmcpTools[3].inputSchema.properties.operation.enum"
        )
        assert browser_operation == ["admin_post_security_two_factor_verify"]

        context = page.evaluate("window.__webmcpTools[0].execute({})")
        assert context["summary"]["total"] == 3

        read = page.evaluate(
            "window.__webmcpTools[1].execute({ operation: 'admin_get_listings', query: { locale: 'en' } })"
        )
        assert read["http_status"] == 200

        write = page.evaluate(
            """window.__webmcpTools[2].execute({
              operation: 'admin_post_listings_status',
              input: { reference: 'MS-CRAWL-0001', status: 'reviewed' },
              confirmation: 'owner-confirmed-in-browser'
            })"""
        )
        assert write["http_status"] == 200

        calls = page.evaluate("window.__webmcpFetches")
        assert calls[0]["url"].endswith("/api/admin/connections/agent-config?catalog=1")
        assert calls[0]["options"]["credentials"] == "same-origin"
        assert calls[1]["options"]["method"] == "GET"
        assert calls[-1]["options"]["method"] == "POST"
        assert calls[-1]["options"]["credentials"] == "same-origin"
        assert "MS-CRAWL-0001" in calls[-1]["options"]["body"]
        assert errors == []
        browser.close()


if __name__ == "__main__":
    main()
