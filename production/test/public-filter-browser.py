"""Run against the local Node preview with an installed Chrome browser."""
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright


def main():
    base = os.environ.get("MS_REALTY_TEST_BASE_URL", "http://127.0.0.1:3186").rstrip("/")
    output = Path(os.environ.get("MS_REALTY_TEST_OUTPUT") or tempfile.mkdtemp(prefix="msr-filter-browser-"))
    output.mkdir(parents=True, exist_ok=True)
    results = []
    values = {"price_min": "325.25", "price_max": "875.50", "bedrooms_min": "2",
              "bedrooms_max": "4", "area_min": "45.5", "area_max": "125.75"}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        for width in [1440, 1024, 390]:
            for theme in ["light", "dark"]:
                context = browser.new_context(viewport={"width": width, "height": 900}, color_scheme=theme)
                page = context.new_page()
                assert page.goto(base + "/en", wait_until="networkidle").status == 200
                page.screenshot(path=str(output / f"hero-{width}-{theme}.png"))
                summary = page.locator(".hp-discovery__summary")
                if summary.is_visible():
                    summary.click()
                page.locator('[name="price_max"]').fill(values["price_max"])
                trigger = page.locator(".hp-search__more-summary")
                trigger.click()
                drawer = page.locator("[data-hero-filter-dialog]")
                assert drawer.is_visible()
                assert drawer.locator('[name="price_max"]').input_value() == values["price_max"]
                drawer.locator('label:has(input[name="offer_type"][value="rent"])').click()
                drawer.locator('[data-drawer-family="apartment"]').click()
                for name, value in values.items():
                    drawer.locator(f'[name="{name}"]').fill(value)
                dimensions = drawer.bounding_box()
                assert abs(dimensions["width"] - min(480, width)) < 1
                assert abs(dimensions["x"] + dimensions["width"] - width) < 1
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
                assert page.locator("html").get_attribute("class").find("public-dialog-open") >= 0
                page.keyboard.press("Escape")
                assert not drawer.is_visible()
                assert trigger.evaluate("element => element === document.activeElement")
                for name, value in values.items():
                    assert page.locator(f'[name="{name}"]').count() == 1
                    assert page.locator(f'[name="{name}"]').input_value() == value
                trigger.click()
                drawer.locator('[name="area_min"]').fill("-1")
                page.keyboard.press("Escape")
                page.locator(".hp-search__go").click()
                assert drawer.is_visible(), "native validation must reveal an invalid secondary filter"
                assert drawer.locator('[name="area_min"]').evaluate("element => element === document.activeElement")
                drawer.locator('[name="area_min"]').fill(values["area_min"])
                drawer.locator('[name="area_max"]').scroll_into_view_if_needed()
                page.screenshot(path=str(output / f"filters-{width}-{theme}.png"))
                drawer.locator('button[type="submit"]').click()
                page.wait_for_url("**/en/search?**")
                query = parse_qs(urlparse(page.url).query)
                for name, value in values.items():
                    assert query[name] == [value], (name, query)
                assert query["offer_type"] == ["rent"]
                assert query["property_family"] == ["apartment"]
                results.append({"width": width, "theme": theme, "drawer": dimensions, "query": query})
                context.close()
        browser.close()
    (output / "checks.json").write_text(json.dumps(results, indent=2))
    print(json.dumps({"passed": len(results), "evidence": str(output)}))


if __name__ == "__main__":
    main()
