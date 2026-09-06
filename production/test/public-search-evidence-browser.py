"""Check read-only search comparison flows against a local Node preview.

Run: MS_REALTY_TEST_BASE_URL=http://127.0.0.1:3186 /usr/bin/python3 production/test/public-search-evidence-browser.py
Requires Python Playwright and installed Chrome. No fixtures or injected scripts.
"""
import json
import os
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright


def request_from_click(page, endpoint, control):
    with page.expect_response("**" + endpoint) as pending:
        control.click()
    response = pending.value
    assert response.status == 200, (endpoint, response.status)
    return response.request.post_data_json, response.json()


def check_dialog(page):
    dialog = page.locator("[data-search-evidence]")
    assert dialog.is_visible()
    geometry = dialog.evaluate("""element => ({
      width: element.clientWidth, scroll: element.scrollWidth,
      small: [...element.querySelectorAll('button,input,select,summary')]
        .filter(item => item.getClientRects().length && item.getBoundingClientRect().height < 44).length
    })""")
    assert geometry["width"] == geometry["scroll"], geometry
    assert geometry["small"] == 0, geometry


def main():
    base = os.environ.get("MS_REALTY_TEST_BASE_URL", "http://127.0.0.1:3186").rstrip("/")
    assert urlparse(base).hostname in ("localhost", "127.0.0.1", "::1"), "Use a local preview"
    listing_id = "MS-CRAWL-0069"
    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        for width, theme in [(1440, "light"), (390, "dark")]:
            context = browser.new_context(viewport={"width": width, "height": 1000}, color_scheme=theme)
            page = context.new_page()
            page.set_default_timeout(10000)
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            assert page.goto(base + "/bg/tarsene?price_max=10000", wait_until="networkidle").status == 200
            card = page.locator(f'article[data-listing-id="{listing_id}"]')
            control = card.locator('[data-evidence-open="match"]')
            assert control.get_attribute("lang") == "bg"
            sent, match = request_from_click(page, "/api/listings/match", control)
            assert sent["listingId"] == match["listing_id"] == listing_id
            assert match["status"] == "recorded_filters_match", match
            check_dialog(page)
            page.locator("[data-evidence-close]").click()
            card.locator("a").first.click()
            page.wait_for_url("**/bg/imoti/" + listing_id)
            sent, match = request_from_click(page, "/api/listings/match", page.locator('[data-evidence-open="match"]'))
            assert sent["listingId"] == match["listing_id"] == listing_id
            assert sent["criteria"]["search_intent"]["price_max"] == 10000
            assert match["status"] == "recorded_filters_match", match
            check_dialog(page)
            page.goto(base + "/bg/tarsene?price_max=10000", wait_until="networkidle")
            request_from_click(page, "/api/search/alternatives", page.locator('[data-evidence-open="alternatives"]'))
            form = page.locator("[data-evidence-change]")
            form.locator('[name="field"]').select_option("price_max")
            form.locator('[name="value"]').fill("130000.25")
            sent, preview = request_from_click(page, "/api/search/alternatives", form.locator('[type="submit"]'))
            assert sent["change"] == {"field": "price_max", "value": 130000.25}
            assert preview["status"] == "preview" and preview["result_count"] is None
            assert preview["count_scope"] == "current_human_approved_source_records"
            check_dialog(page)
            page.locator("[data-evidence-apply]").click()
            page.wait_for_url("**/bg/tarsene?**")
            applied = json.loads(parse_qs(urlparse(page.url).query)["search_intent"][0])
            assert applied["price_max"] == 130000.25
            # A real subsequent click catches a destination frozen during navigation.
            request_from_click(page, "/api/search/alternatives", page.locator('[data-evidence-open="alternatives"]'))
            assert not errors, errors
            results.append({"width": width, "theme": theme, "listing_id": listing_id,
                            "match": match["status"], "applied_price_max": applied["price_max"]})
            context.close()
        browser.close()
    print(json.dumps({"status": "pass", "flows": results}, indent=2))


if __name__ == "__main__":
    main()
