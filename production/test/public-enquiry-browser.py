"""Check actual public renderers and browser bundles with isolated lead responses.

Run with the local Node preview running. This is UI evidence, not proof of a
production lead write: POST responses are intercepted and no message is sent.
"""
import json
import os
import subprocess
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]


def main():
    base = os.environ.get("MS_REALTY_TEST_BASE_URL", "http://127.0.0.1:3192").rstrip("/")
    output = Path(os.environ.get("MS_REALTY_TEST_OUTPUT") or tempfile.mkdtemp(prefix="msr-enquiry-browser-"))
    output.mkdir(parents=True, exist_ok=True)
    source = """
import {loadLocaleRegistry} from './production/lib/locales.mjs';
import {renderContactPage,renderSellerPage} from './production/lib/public-site.mjs';
import {renderHtmlPage} from './production/lib/html.mjs';
const pages={};
for(const localeCode of ['en','he']) for(const render of [renderContactPage,renderSellerPage]) {
 const page=render({registry:loadLocaleRegistry(),localeCode,leadWritesDisabled:false});
 pages[page.kind+':'+localeCode]={path:page.path,html:renderHtmlPage(page)};
}
console.log(JSON.stringify(pages));
"""
    pages = json.loads(subprocess.check_output([os.environ.get("NODE", "node"), "--input-type=module", "-e", source], cwd=ROOT, text=True))
    checks = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        for locale in ["en", "he"]:
            for width in [1440, 390]:
                for theme in ["light", "dark"]:
                    context = browser.new_context(viewport={"width": width, "height": 1000}, color_scheme=theme)
                    for kind in ["seller", "contact"]:
                        fixture = pages[f"{kind}:{locale}"]
                        page = context.new_page()
                        errors = []
                        page.on("pageerror", lambda error: errors.append(str(error)))
                        page.route(base + fixture["path"], lambda route: route.fulfill(status=200, content_type="text/html", body=fixture["html"]))
                        attempts = []
                        status_checks = []
                        # The receipt flow: a 503 with no intake_status leaves the
                        # outcome unknown, so the form offers a status check; the
                        # status service says nothing was received and a retry is
                        # safe, and only then does the same enquiry go out again.
                        def receipt(body):
                            return json.dumps({"receipt": {"kind": "lead_receipt", "state": "received", "lead_id": "lead-ui-test",
                                "idempotency_key": body["idempotencyKey"], "source": body["source"],
                                "listing_reference": body.get("listingReference") or None}})
                        def respond(route):
                            body = route.request.post_data_json
                            attempts.append(body)
                            if len(attempts) == 1:
                                route.fulfill(status=503, content_type="application/json", body='{"kind":"lead_store_unavailable"}')
                            else:
                                route.fulfill(status=201, content_type="application/json", body=receipt(body))
                        def status(route):
                            body = route.request.post_data_json
                            status_checks.append(body)
                            route.fulfill(status=200, content_type="application/json", body=json.dumps({"kind": "lead_status", "state": "not_received",
                                "retry_safe": True, "idempotency_key": body["idempotencyKey"]}))
                        page.route("**/api/leads", respond)
                        page.route("**/api/leads/status", status)
                        page.goto(base + fixture["path"], wait_until="networkidle")
                        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
                        form = page.locator("#seller-enquiry" if kind == "seller" else "#contact-form")
                        expect(form).to_be_visible()
                        if kind == "seller":
                            form.locator('[name="property.location"]').fill("Sandanski")
                            form.locator('[name="property.type"]').select_option(index=1)
                            form.locator('[name="property.area"]').fill("-1")
                            form.locator('[data-seller-next]:visible').click()
                            assert form.get_attribute("data-seller-step") == "1", "optional invalid numbers must stop the stepper"
                            form.locator('[name="property.area"]').fill("85.75")
                            form.locator('[data-seller-next]:visible').click()
                        form.locator('[name="contact.name"]').fill("UI test")
                        form.locator('[name="contact.phone"]').fill("+359880000001")
                        form.locator('[name="contact.email"]').fill("ui-test@example.test")
                        form.locator('[name="message"]').fill("Browser verification; intercepted request.")
                        if kind == "seller":
                            form.locator('[data-seller-next]:visible').click()
                            expect(form.locator('[data-seller-summary="property.area"]')).to_have_text("85.75")
                        page.screenshot(path=str(output / f"{kind}-{locale}-{width}-{theme}.png"), full_page=True)
                        form.locator('[type="submit"]').click()
                        expect(form.locator('[data-enquiry-error]')).to_be_visible()
                        assert form.locator('[name="contact.name"]').input_value() == "UI test"
                        expect(form.locator('[type="submit"]')).to_be_disabled()
                        form.locator('[data-enquiry-status-check]').click()
                        expect(form.locator('[type="submit"]')).to_be_enabled()
                        assert len(status_checks) == 1 and status_checks[0]["idempotencyKey"] == attempts[0]["idempotencyKey"]
                        form.locator('[type="submit"]').click()
                        expect(page.locator('main [data-request-success]')).to_be_visible()
                        assert len(attempts) == 2 and attempts[0] == attempts[1]
                        assert attempts[1]["contact"]["phone"] == "+359880000001"
                        assert not errors, errors
                        checks.append({"kind": kind, "locale": locale, "width": width, "theme": theme, "attempts": len(attempts)})
                        page.close()
                    context.close()
        browser.close()
    (output / "checks.json").write_text(json.dumps(checks, indent=2))
    print(json.dumps({"passed": len(checks), "evidence": str(output)}))


if __name__ == "__main__":
    main()
