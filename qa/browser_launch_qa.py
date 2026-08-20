#!/usr/bin/env python3
"""Exercise the production HTTP UI at desktop and mobile sizes with Playwright."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "production" / "data" / "browser-launch-qa-report.json"
BASE_URL = os.environ.get("MS_REALTY_BROWSER_QA_BASE_URL", "http://127.0.0.1:4321").rstrip("/")
SESSION_TOKEN = "payload.browser.qa"
VIEWPORTS = {"desktop": {"width": 1440, "height": 900}, "mobile": {"width": 390, "height": 844}}
SENSITIVE_MARKERS = [
    "BROWSER_QA_CREDENTIAL_MARKER",
    "browser-qa-google-secret",
    "browser-qa-provider-key",
    "credential_envelope",
]


def same_origin_failures(page: Page) -> list[dict[str, str]]:
    failures: list[dict[str, str]] = []
    page.on(
        "requestfailed",
        lambda request: failures.append({"url": request.url, "error": request.failure or "unknown"})
        if request.url.startswith(BASE_URL)
        else None,
    )
    return failures


def page_a11y(page: Page) -> dict[str, int]:
    return page.evaluate(
        """() => ({
          images_without_alt: document.querySelectorAll('img:not([alt])').length,
          unlabeled_form_controls: [...document.querySelectorAll('input:not([type=hidden]), select, textarea')]
            .filter((control) => !control.labels?.length && !control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby')).length,
          horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        })"""
    )


def visit(page: Page, path: str) -> int:
    response = page.goto(f"{BASE_URL}{path}", wait_until="networkidle")
    if response is None:
        raise AssertionError(f"No document response for {path}")
    if response.status != 200:
        raise AssertionError(f"{path} returned {response.status}")
    return response.status


def run_viewport(browser, name: str, viewport: dict[str, int], screenshot_dir: Path) -> dict[str, object]:
    context = browser.new_context(viewport=viewport, locale="bg-BG")
    context.add_cookies([{"name": "ms_admin", "value": SESSION_TOKEN, "url": BASE_URL}])
    page = context.new_page()
    console_errors: list[str] = []
    page_errors: list[str] = []
    request_failures = same_origin_failures(page)
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    listing_status = visit(page, "/bg/imoti/MS-CRAWL-0001")
    if page.locator("main[data-kind='listing']").count() != 1:
        raise AssertionError("Listing landmark is missing")
    listing_a11y = page_a11y(page)
    if any(listing_a11y.values()):
        raise AssertionError(f"Listing accessibility/layout regression: {listing_a11y}")

    page.locator("button[data-endpoint='/api/leads'][data-lead-intent='viewing']:visible").first.click()
    dialog = page.locator("#mk-enquiry")
    dialog.wait_for(state="visible")
    dialog.locator("input[name='contact.name']").fill("Browser QA")
    dialog.locator("input[data-enquiry-contact]").fill("+359880000099")
    dialog.locator("input[data-enquiry-viewing-date]").fill((datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat())
    dialog.locator("input[data-enquiry-viewing-time]").fill("10:30")
    with page.expect_response(lambda response: response.url == f"{BASE_URL}/api/leads" and response.request.method == "POST") as lead_response:
        dialog.locator("button[type='submit']").click()
    if lead_response.value.status != 201:
        raise AssertionError(f"Lead submission returned {lead_response.value.status}")
    dialog.locator(".ct-done:not([hidden])").wait_for(state="visible")
    page.screenshot(path=str(screenshot_dir / f"{name}-listing-success.png"), full_page=True)

    connect_status = visit(page, "/admin/connect")
    connect_text = page.locator("body").inner_text()
    connect_html = page.locator("body").inner_html()
    if "Подключения MS Realty" not in connect_text or any(marker in connect_html for marker in SENSITIVE_MARKERS):
        raise AssertionError("Connection center is missing or exposes a credential marker")
    if not all(provider in connect_text for provider in ("Google", "WhatsApp", "Viber")):
        raise AssertionError("Connection center does not expose all provider cards")
    connect_a11y = page_a11y(page)
    if any(connect_a11y.values()):
        raise AssertionError(f"Connection center accessibility/layout regression: {connect_a11y}")
    page.screenshot(path=str(screenshot_dir / f"{name}-connections.png"), full_page=True)

    viewings_status = visit(page, "/admin/viewings")
    if page.locator("main[data-kind='admin-viewings']").count() != 1:
        raise AssertionError("Viewings workspace landmark is missing")
    viewings_a11y = page_a11y(page)
    if any(viewings_a11y.values()):
        raise AssertionError(f"Viewings accessibility/layout regression: {viewings_a11y}")
    page.screenshot(path=str(screenshot_dir / f"{name}-viewings.png"), full_page=True)

    request_failures_snapshot = list(request_failures)
    result = {
        "viewport": viewport,
        "listing": {"status": listing_status, "lead_submit_status": lead_response.value.status, **listing_a11y},
        "connections": {"status": connect_status, "providers": ["google", "whatsapp", "viber"], **connect_a11y},
        "viewings": {"status": viewings_status, **viewings_a11y},
        "console_errors": console_errors,
        "page_errors": page_errors,
        "same_origin_request_failures": request_failures_snapshot,
    }
    if console_errors or page_errors or request_failures_snapshot:
        context.close()
        raise AssertionError(f"Browser errors for {name}: {result}")
    context.close()
    return result


def main() -> int:
    screenshot_dir = Path(tempfile.mkdtemp(prefix="ms-realty-browser-qa-"))
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            results = [run_viewport(browser, name, viewport, screenshot_dir) for name, viewport in VIEWPORTS.items()]
        finally:
            browser.close()
    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "pass",
        "source_mode": "production_http_router_with_approved_public_fixture_temporary_ledgers_and_stubbed_durable_lead_receipt",
        "live_production_verified": False,
        "screenshots_committed": False,
        "results": results,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", "viewports": len(results), "screenshots": str(screenshot_dir)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
